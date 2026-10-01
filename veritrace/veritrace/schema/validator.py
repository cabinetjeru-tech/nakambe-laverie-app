"""Validateur du schéma normalisé Veritrace.

Deux niveaux de contrôle :

1. **Structurel** — conformité au JSON Schema (Draft 2020-12) `veritrace_case.schema.json`.
2. **Sémantique** — ce qu'un JSON Schema ne sait pas exprimer :
   unicité des identifiants, intégrité référentielle (artefact → exécution d'outil → preuve),
   cohérence des empreintes (custody ↔ preuve, `content_sha256` ↔ données),
   cohérence du marquage « corroboré », dates réellement valides, chronologie start ≤ end.
   Optionnellement (`case_root`), re-hachage des fichiers de preuve sur disque.

Les problèmes sont classés `error` (le document est rejeté : aucun rapport ne sera produit)
ou `warning` (signalé, non bloquant).

Pour brancher un autre schéma (ex. le schéma de référence du promoteur), passer
`schema_path=` ou définir la variable d'environnement VERITRACE_SCHEMA.
"""
from __future__ import annotations

import json
import os
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jsonschema import Draft202012Validator

from veritrace.core.hashing import sha256_file, sha256_json
from veritrace.core.timeutil import parse_iso

SCHEMA_PATH = Path(__file__).with_name("veritrace_case.schema.json")


@dataclass(frozen=True)
class Issue:
    level: str      # "error" | "warning"
    path: str       # chemin JSON lisible, ex. artifacts[3].source.run_id
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
    """Levée par `ensure_valid` quand le document contient au moins une erreur."""

    def __init__(self, report: ValidationReport) -> None:
        self.report = report
        lines = "\n".join(f"  - {i}" for i in report.errors[:20])
        more = f"\n  … et {len(report.errors) - 20} autre(s)" if len(report.errors) > 20 else ""
        super().__init__(f"Document non conforme ({len(report.errors)} erreur(s)) :\n{lines}{more}")


# --------------------------------------------------------------------------- utilitaires
def load_schema(schema_path: str | Path | None = None) -> dict[str, Any]:
    path = Path(schema_path or os.environ.get("VERITRACE_SCHEMA") or SCHEMA_PATH)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _fmt_path(parts: Iterable[Any]) -> str:
    out = ""
    for p in parts:
        out += f"[{p}]" if isinstance(p, int) else (f".{p}" if out else str(p))
    return out


def content_hash(category: str, data: dict[str, Any]) -> str:
    """Empreinte de dédoublonnage d'un artefact — DOIT être utilisée par tous les wrappers."""
    return sha256_json({"category": category, "data": data})


# --------------------------------------------------------------------------- validation
def validate(doc: Any, *, schema_path: str | Path | None = None,
             case_root: str | Path | None = None) -> ValidationReport:
    """Valide un document ; ne lève pas d'exception (sauf schéma introuvable)."""
    report = ValidationReport()
    validator = Draft202012Validator(load_schema(schema_path))

    for err in sorted(validator.iter_errors(doc), key=lambda e: list(e.absolute_path)):
        report.error(_fmt_path(err.absolute_path), err.message)

    # Les contrôles sémantiques supposent la forme générale correcte.
    if isinstance(doc, dict) and all(isinstance(doc.get(k), list) for k in
                                     ("devices", "acquisitions", "evidence_items", "custody_chain",
                                      "tool_runs", "artifacts", "timeline", "findings")):
        _semantic_checks(doc, report, Path(case_root) if case_root else None)
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
def _index(items: list[dict], key: str, coll: str, report: ValidationReport) -> dict[str, dict]:
    idx: dict[str, dict] = {}
    counts = Counter(i.get(key) for i in items if isinstance(i, dict))
    for i, item in enumerate(items):
        if not isinstance(item, dict) or key not in item:
            continue
        if counts[item[key]] > 1:
            report.error(f"{coll}[{i}].{key}", f"identifiant dupliqué « {item[key]} »")
        idx.setdefault(item[key], item)
    return idx


def _check_ts(value: Any, path: str, report: ValidationReport):
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


def _check_ref(value: Any, idx: dict, path: str, target: str, report: ValidationReport) -> None:
    if value is not None and value not in idx:
        report.error(path, f"référence inconnue « {value} » (absente de {target})")


def _semantic_checks(doc: dict, report: ValidationReport, case_root: Path | None) -> None:
    devices = _index(doc["devices"], "device_id", "devices", report)
    acqs = _index(doc["acquisitions"], "acquisition_id", "acquisitions", report)
    evidence = _index(doc["evidence_items"], "evidence_id", "evidence_items", report)
    _index(doc["custody_chain"], "event_id", "custody_chain", report)
    runs = _index(doc["tool_runs"], "run_id", "tool_runs", report)
    artifacts = _index(doc["artifacts"], "artifact_id", "artifacts", report)
    _index(doc["timeline"], "event_id", "timeline", report)
    _index(doc["findings"], "finding_id", "findings", report)

    case = doc.get("case") or {}
    if isinstance(case, dict):
        _check_ts(case.get("created_at"), "case.created_at", report)
        tz = case.get("display_timezone")
        if tz:
            try:
                ZoneInfo(tz)
            except (ZoneInfoNotFoundError, ValueError):
                report.warn("case.display_timezone", f"fuseau inconnu « {tz} », UTC sera utilisé")
        auth = case.get("legal_authorization") or {}
        if isinstance(auth, dict):
            _check_ts(auth.get("verified_at"), "case.legal_authorization.verified_at", report)

    # Acquisitions
    for i, a in enumerate(doc["acquisitions"]):
        p = f"acquisitions[{i}]"
        _check_ref(a.get("device_id"), devices, f"{p}.device_id", "devices", report)
        s = _check_ts(a.get("started_at"), f"{p}.started_at", report)
        e = _check_ts(a.get("ended_at"), f"{p}.ended_at", report)
        if s and e and e < s:
            report.warn(p, "ended_at antérieur à started_at")

    # Preuves + chaîne de custody
    collected: set[str] = set()
    for i, c in enumerate(doc["custody_chain"]):
        p = f"custody_chain[{i}]"
        _check_ts(c.get("timestamp"), f"{p}.timestamp", report)
        ev = evidence.get(c.get("evidence_id"))
        _check_ref(c.get("evidence_id"), evidence, f"{p}.evidence_id", "evidence_items", report)
        if ev and c.get("sha256") != ev.get("sha256"):
            report.error(f"{p}.sha256",
                         f"empreinte différente de celle de la preuve {ev.get('evidence_id')} "
                         "— altération possible, rupture de la chaîne de custody")
        if c.get("action") == "collected":
            collected.add(c.get("evidence_id"))

    for i, ev in enumerate(doc["evidence_items"]):
        p = f"evidence_items[{i}]"
        _check_ref(ev.get("acquisition_id"), acqs, f"{p}.acquisition_id", "acquisitions", report)
        _check_ts(ev.get("collected_at"), f"{p}.collected_at", report)
        if ev.get("evidence_id") not in collected:
            report.error(p, "aucun événement de custody « collected » pour cette preuve")
        if case_root is not None and ev.get("local_path"):
            f = (case_root / ev["local_path"]).resolve()
            if not f.is_file():
                report.error(f"{p}.local_path", f"fichier introuvable : {f}")
            elif sha256_file(f) != ev.get("sha256"):
                report.error(f"{p}.sha256", f"le fichier sur disque ne correspond plus à l'empreinte : {f}")

    # Exécutions d'outils
    for i, r in enumerate(doc["tool_runs"]):
        p = f"tool_runs[{i}]"
        for j, eid in enumerate(r.get("input_evidence_ids") or []):
            _check_ref(eid, evidence, f"{p}.input_evidence_ids[{j}]", "evidence_items", report)
        s = _check_ts(r.get("started_at"), f"{p}.started_at", report)
        e = _check_ts(r.get("ended_at"), f"{p}.ended_at", report)
        if s and e and e < s:
            report.warn(p, "ended_at antérieur à started_at")

    # Artefacts
    for i, art in enumerate(doc["artifacts"]):
        p = f"artifacts[{i}]"
        _check_ts(art.get("timestamp"), f"{p}.timestamp", report)
        src = art.get("source") or {}
        run = runs.get(src.get("run_id"))
        _check_ref(src.get("run_id"), runs, f"{p}.source.run_id", "tool_runs", report)
        _check_ref(src.get("evidence_id"), evidence, f"{p}.source.evidence_id", "evidence_items", report)
        if run and (run.get("tool") or {}).get("name") != (src.get("tool") or {}).get("name"):
            report.warn(f"{p}.source.tool", "outil différent de celui de l'exécution référencée")
        if isinstance(art.get("data"), dict) and isinstance(art.get("category"), str):
            expected = content_hash(art["category"], art["data"])
            if art.get("content_sha256") != expected:
                report.error(f"{p}.content_sha256", f"ne correspond pas aux données (attendu {expected})")
        corr = art.get("corroboration") or {}
        sources = corr.get("sources") or []
        tools = {s.get("tool") for s in sources if isinstance(s, dict)}
        for j, s in enumerate(sources):
            if isinstance(s, dict):
                _check_ref(s.get("artifact_id"), artifacts, f"{p}.corroboration.sources[{j}].artifact_id",
                           "artifacts", report)
        if corr.get("status") == "corroborated" and len(tools) < 2:
            report.error(f"{p}.corroboration", "« corroborated » exige au moins deux outils distincts")
        if corr.get("status") == "single_source" and len(tools) > 1:
            report.error(f"{p}.corroboration", "plusieurs outils listés mais statut « single_source »")

    # Timeline
    for i, t in enumerate(doc["timeline"]):
        p = f"timeline[{i}]"
        _check_ts(t.get("timestamp"), f"{p}.timestamp", report)
        refs = [artifacts.get(a) for a in t.get("artifact_ids") or []]
        for j, aid in enumerate(t.get("artifact_ids") or []):
            _check_ref(aid, artifacts, f"{p}.artifact_ids[{j}]", "artifacts", report)
        any_corr = any(r and (r.get("corroboration") or {}).get("status") == "corroborated" for r in refs)
        if t.get("corroborated") and not any_corr:
            report.warn(f"{p}.corroborated", "marqué corroboré sans artefact corroboré")

    # Constats
    for i, f in enumerate(doc["findings"]):
        p = f"findings[{i}]"
        for j, aid in enumerate(f.get("artifact_ids") or []):
            _check_ref(aid, artifacts, f"{p}.artifact_ids[{j}]", "artifacts", report)
        for j, eid in enumerate(f.get("evidence_ids") or []):
            _check_ref(eid, evidence, f"{p}.evidence_ids[{j}]", "evidence_items", report)
        if f.get("severity") in ("high", "critical") and not f.get("artifact_ids"):
            report.warn(p, "constat de sévérité élevée sans artefact à l'appui")
