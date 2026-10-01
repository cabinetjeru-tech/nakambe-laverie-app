"""Validateur du format pivot Veritrace (JSON Schema draft-07 + contrôles sémantiques).

1. **Structurel** — conformité à `veritrace_pivot.schema.json` (draft-07).
2. **Sémantique** — ce qu'un JSON Schema ne sait pas exprimer :
   - unicité des identifiants (acquisitions, éléments, artefacts, constats, événements) ;
   - intégrité référentielle : artefact → élément de preuve, constat → artefacts/éléments,
     timeline → artefacts, custody → élément, exécution d'outil → éléments ;
   - empreintes : chaque événement de custody porte l'empreinte de son élément ; chaque
     élément a un événement « collecte » ; `sha256` d'un artefact = SHA-256 de {category, data} ;
     `x_veritrace.fact_sha256` (si présent) cohérent avec les données ;
   - corroboration : `corroborated` vrai ⇔ au moins deux moteurs indépendants pour ce fait ;
   - dates réellement valides et avec fuseau ;
   - optionnellement (`case_root`), re-hachage des éléments et pièces sur disque.

Niveaux : `error` (document rejeté : aucun rapport) ou `warning` (signalé).
Un autre fichier de schéma peut être utilisé via `schema_path=` ou VERITRACE_SCHEMA.
"""
from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jsonschema import Draft7Validator

from veritrace.core.hashing import sha256_json, sha256_path
from veritrace.core.timeutil import parse_iso
from veritrace.schema.pivot import engine, ext, iter_items

SCHEMA_PATH = Path(__file__).with_name("veritrace_pivot.schema.json")


@dataclass(frozen=True)
class Issue:
    level: str
    path: str
    message: str

    def __str__(self) -> str:
        return f"[{self.level.upper()}] {self.path or '<racine>'} : {self.message}"


@dataclass
class ValidationReport:
    issues: list[Issue] = field(default_factory=list)

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "warning"]

    @property
    def ok(self) -> bool:
        return not self.errors

    def error(self, path: str, msg: str) -> None:
        self.issues.append(Issue("error", path, msg))

    def warn(self, path: str, msg: str) -> None:
        self.issues.append(Issue("warning", path, msg))


class CaseValidationError(ValueError):
    def __init__(self, report: ValidationReport) -> None:
        self.report = report
        lines = "\n".join(f"  - {i}" for i in report.errors[:20])
        more = f"\n  … et {len(report.errors) - 20} autre(s)" if len(report.errors) > 20 else ""
        super().__init__(f"Document non conforme ({len(report.errors)} erreur(s)) :\n{lines}{more}")


def load_schema(schema_path: str | Path | None = None) -> dict[str, Any]:
    path = Path(schema_path or os.environ.get("VERITRACE_SCHEMA") or SCHEMA_PATH)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def content_hash(category: str, data: dict[str, Any]) -> str:
    """`artifact.sha256` — DOIT être calculé ainsi par tous les wrappers."""
    return sha256_json({"category": category, "data": data})


def artifact_engine(art: dict[str, Any]) -> str:  # alias conservé pour les modules existants
    return engine(art)


def _fmt_path(parts: Iterable[Any]) -> str:
    out = ""
    for p in parts:
        out += f"[{p}]" if isinstance(p, int) else (f".{p}" if out else str(p))
    return out


def validate(doc: Any, *, schema_path: str | Path | None = None,
             case_root: str | Path | None = None) -> ValidationReport:
    report = ValidationReport()
    validator = Draft7Validator(load_schema(schema_path))
    for err in sorted(validator.iter_errors(doc), key=lambda e: list(e.absolute_path)):
        report.error(_fmt_path(err.absolute_path), err.message)
    lists = ("acquisitions", "artifacts", "findings", "timeline", "chain_of_custody")
    if isinstance(doc, dict) and all(isinstance(doc.get(k), list) for k in lists) and isinstance(doc.get("case"), dict):
        _semantic(doc, report, Path(case_root) if case_root else None)
    return report


def ensure_valid(doc: Any, **kwargs: Any) -> ValidationReport:
    report = validate(doc, **kwargs)
    if not report.ok:
        raise CaseValidationError(report)
    return report


def validate_file(path: str | Path, **kwargs: Any) -> ValidationReport:
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
    except json.JSONDecodeError as exc:
        r = ValidationReport()
        r.error("", f"JSON illisible : {exc}")
        return r
    return validate(doc, **kwargs)


# --------------------------------------------------------------------------- sémantique
def _ts(value: Any, path: str, report: ValidationReport):
    if not isinstance(value, str):
        return None
    try:
        dt = parse_iso(value)
    except ValueError:
        report.error(path, f"horodatage invalide « {value} »")
        return None
    if dt.tzinfo is None:
        report.error(path, "horodatage sans fuseau horaire")
        return None
    return dt


def _unique(values: list[tuple[str, Any]], report: ValidationReport) -> None:
    counts = Counter(v for _, v in values)
    for path, v in values:
        if counts[v] > 1:
            report.error(path, f"identifiant dupliqué « {v} »")


def _ref(value: Any, index: dict | set, path: str, what: str, report: ValidationReport) -> None:
    if value is not None and value not in index:
        report.error(path, f"référence inconnue « {value} » ({what})")


def _semantic(doc: dict, report: ValidationReport, case_root: Path | None) -> None:
    from veritrace.schema.facts import fact_hash  # import tardif (facts dépend de hashing seulement)

    case = doc["case"]
    _ts(case.get("created_at"), "case.created_at", report)
    _ts((case.get("authorization") or {}).get("confirmed_at"), "case.authorization.confirmed_at", report)
    tz = ext(case).get("display_timezone")
    if tz:
        try:
            ZoneInfo(tz)
        except (ZoneInfoNotFoundError, ValueError):
            report.warn("case.x_veritrace.display_timezone", f"fuseau inconnu « {tz} », UTC sera utilisé")

    # Acquisitions et éléments de preuve
    _unique([(f"acquisitions[{i}].acquisition_id", a.get("acquisition_id")) for i, a in enumerate(doc["acquisitions"])], report)
    items: dict[str, dict] = {}
    item_paths = []
    for i, acq in enumerate(doc["acquisitions"]):
        p = f"acquisitions[{i}]"
        s, e = _ts(acq.get("started_at"), f"{p}.started_at", report), _ts(acq.get("ended_at"), f"{p}.ended_at", report)
        if s and e and e < s:
            report.warn(p, "ended_at antérieur à started_at")
        for j, it in enumerate(acq.get("items") or []):
            ip = f"{p}.items[{j}]"
            item_paths.append((f"{ip}.item_id", it.get("item_id")))
            items.setdefault(it.get("item_id"), it)
            _ts(it.get("collected_at"), f"{ip}.collected_at", report)
            if case_root is not None and it.get("path"):
                f = (case_root / it["path"]).resolve()
                if not f.exists():
                    report.error(f"{ip}.path", f"élément introuvable : {f}")
                elif sha256_path(f) != it.get("sha256"):
                    report.error(f"{ip}.sha256", f"le contenu sur disque ne correspond plus à l'empreinte : {f}")
    _unique(item_paths, report)

    # Chaîne de custody
    _unique([(f"chain_of_custody[{i}].event_id", c.get("event_id")) for i, c in enumerate(doc["chain_of_custody"])], report)
    collected = set()
    for i, c in enumerate(doc["chain_of_custody"]):
        p = f"chain_of_custody[{i}]"
        _ts(c.get("timestamp"), f"{p}.timestamp", report)
        _ref(c.get("item_id"), items, f"{p}.item_id", "élément de preuve", report)
        it = items.get(c.get("item_id"))
        if it and c.get("sha256") != it.get("sha256"):
            report.error(f"{p}.sha256", f"empreinte différente de celle de l'élément {it.get('item_id')} "
                                        "— altération possible, rupture de la chaîne de custody")
        if c.get("action") == "collecte":
            collected.add(c.get("item_id"))
    for _, it in iter_items(doc):
        if it.get("item_id") not in collected:
            report.error(f"item {it.get('item_id')}", "aucun événement de custody « collecte » pour cet élément")

    # Exécutions d'outils (extension)
    runs = {r.get("run_id") for r in (doc.get("x_veritrace") or {}).get("tool_runs") or []}
    for i, r in enumerate((doc.get("x_veritrace") or {}).get("tool_runs") or []):
        p = f"x_veritrace.tool_runs[{i}]"
        for j, iid in enumerate(r.get("input_item_ids") or []):
            _ref(iid, items, f"{p}.input_item_ids[{j}]", "élément de preuve", report)
        s, e = _ts(r.get("started_at"), f"{p}.started_at", report), _ts(r.get("ended_at"), f"{p}.ended_at", report)
        if s and e and e < s:
            report.warn(p, "ended_at antérieur à started_at")

    # Artefacts
    arts = doc["artifacts"]
    _unique([(f"artifacts[{i}].artifact_id", a.get("artifact_id")) for i, a in enumerate(arts)], report)
    by_id = {a.get("artifact_id"): a for a in arts if isinstance(a, dict)}
    groups: dict[str, set[str]] = defaultdict(set)
    for i, a in enumerate(arts):
        p = f"artifacts[{i}]"
        _ts(a.get("timestamp"), f"{p}.timestamp", report)
        src = a.get("source") or {}
        _ref(src.get("item_id"), items, f"{p}.source.item_id", "élément de preuve", report)
        x = ext(a)
        if x.get("run_id"):
            _ref(x["run_id"], runs, f"{p}.x_veritrace.run_id", "exécution d'outil", report)
        if not isinstance(a.get("data"), dict) or not isinstance(a.get("category"), str):
            continue
        if a.get("sha256") != content_hash(a["category"], a["data"]):
            report.error(f"{p}.sha256", f"ne correspond pas aux données (attendu {content_hash(a['category'], a['data'])})")
        rec_status = (x.get("recovery") or {}).get("status")
        expected_fact = fact_hash(a["category"], a["data"], a.get("timestamp"), rec_status)
        if x.get("fact_sha256") and x["fact_sha256"] != expected_fact:
            report.error(f"{p}.x_veritrace.fact_sha256", f"ne correspond pas au fait (attendu {expected_fact})")
        groups[expected_fact].add(engine(a))
        for j, s in enumerate(x.get("sources") or []):
            _ref(s.get("artifact_id"), by_id, f"{p}.x_veritrace.sources[{j}].artifact_id", "artefact", report)
    for i, a in enumerate(arts):
        if not isinstance(a.get("data"), dict):
            continue
        n = len(groups[fact_hash(a["category"], a["data"], a.get("timestamp"),
                                 (ext(a).get("recovery") or {}).get("status"))])
        if a.get("corroborated") and n < 2:
            report.error(f"artifacts[{i}].corroborated", "« corroboré » exige au moins deux moteurs d'analyse distincts")
        if a.get("corroborated") is False and n >= 2:
            report.error(f"artifacts[{i}].corroborated", f"fait extrait par {n} moteurs distincts mais non marqué corroboré")

    # Timeline
    _unique([(f"timeline[{i}].event_id", t.get("event_id")) for i, t in enumerate(doc["timeline"])], report)
    for i, t in enumerate(doc["timeline"]):
        p = f"timeline[{i}]"
        _ts(t.get("timestamp"), f"{p}.timestamp", report)
        for j, aid in enumerate(t.get("artifact_ids") or []):
            _ref(aid, by_id, f"{p}.artifact_ids[{j}]", "artefact", report)
        if t.get("corroborated") and not any((by_id.get(a) or {}).get("corroborated") for a in t.get("artifact_ids") or []):
            report.warn(f"{p}.corroborated", "marqué corroboré sans artefact corroboré")

    # Constats
    _unique([(f"findings[{i}].finding_id", f.get("finding_id")) for i, f in enumerate(doc["findings"])], report)
    exhibits = []
    for i, f in enumerate(doc["findings"]):
        p = f"findings[{i}]"
        for j, aid in enumerate(f.get("artifact_ids") or []):
            _ref(aid, by_id, f"{p}.artifact_ids[{j}]", "artefact", report)
        for j, iid in enumerate(f.get("item_ids") or []):
            _ref(iid, items, f"{p}.item_ids[{j}]", "élément de preuve", report)
        if not f.get("artifact_ids"):
            report.warn(p, "constat sans artefact à l'appui (refusé par le gabarit judiciaire)")
        if f.get("type") == "ioc" and not f.get("ioc"):
            report.warn(p, "constat de type « ioc » sans bloc « ioc » (indicateur correspondant)")
        for j, ex in enumerate(ext(f).get("exhibits") or []):
            ep = f"{p}.x_veritrace.exhibits[{j}]"
            exhibits.append((f"{ep}.exhibit_id", ex.get("exhibit_id")))
            _ref(ex.get("artifact_id"), by_id, f"{ep}.artifact_id", "artefact", report)
            _ts(ex.get("captured_at"), f"{ep}.captured_at", report)
            if case_root is not None and ex.get("path"):
                fp = (case_root / ex["path"]).resolve()
                if not fp.is_file():
                    report.error(f"{ep}.path", f"pièce introuvable : {fp}")
                elif sha256_path(fp) != ex.get("sha256"):
                    report.error(f"{ep}.sha256", f"la pièce sur disque ne correspond plus à l'empreinte : {fp}")
    _unique(exhibits, report)


def fragment_errors(fragment: dict[str, Any], *, schema_path: str | Path | None = None) -> list[str]:
    """Erreurs de conformité d'une sortie de wrapper (artefacts et constats au format pivot).

    Les identifiants locaux (L1, L2…) sont valides au regard du schéma ; les références
    croisées sont contrôlées après fusion dans l'affaire.
    """
    defs = load_schema(schema_path)["definitions"]
    errors: list[str] = []
    for kind, key in (("artifact", "artifacts"), ("finding", "findings")):
        v = Draft7Validator({"$ref": f"#/definitions/{kind}", "definitions": defs})
        for i, obj in enumerate(fragment.get(key) or []):
            for e in v.iter_errors(obj):
                where = f"{key}[{i}]" + (f".{_fmt_path(e.absolute_path)}" if e.absolute_path else "")
                errors.append(f"{where} : {e.message}")
    return errors
