"""Exécution d'un wrapper et versement de ses résultats dans le dossier d'affaire.

Séquence pour chaque outil :
  1. enregistrement (ou revérification) de l'extraction comme preuve hachée ;
  2. exécution / import par le wrapper → sortie brute dans parsed/<outil>/<RUN-ID>/ ;
  3. écriture du fragment normalisé parsed/<outil>/<RUN-ID>/veritrace_normalized.json ;
  4. fusion dans le JSON de l'affaire (identifiants définitifs, pas de doublon en cas de
     ré-exécution) ;
  5. corrélation inter-outils ; validation ; sauvegarde ; journal d'audit.

Outil absent → exécution « skipped » consignée + avertissement ; outil en échec →
exécution « failed » consignée. Dans les deux cas : pas d'exception, l'affaire reste valide.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from veritrace.core.case import Case
from veritrace.core.evidence import IntegrityError, next_id, record_parsed, register_or_verify
from veritrace.core.hashing import sha256_path
from veritrace.core.logging_setup import get_logger
from veritrace.core.timeutil import utc_now_iso
from veritrace.correlation.engine import correlate
from veritrace.parsing.base import RunContext, ToolFailed, ToolUnavailable, ToolWrapper, WrapperResult
from veritrace.parsing.mvt import IocFileError

log = get_logger("parsing.runner")

LABELS = {"aleapp": "ALEAPP", "mvt": "MVT", "autopsy": "Autopsy"}


@dataclass
class RunOutcome:
    run_id: str
    status: str                 # success | skipped | failed
    message: str
    artifacts_added: int = 0
    artifacts_already_known: int = 0
    findings_added: int = 0
    correlation: dict[str, int] = field(default_factory=dict)


def _rel(root: Path, p: Path | None) -> str | None:
    if p is None:
        return None
    try:
        return p.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(p.resolve())


def _merge(doc: dict, result: WrapperResult, run_id: str) -> tuple[int, int, int]:
    """Fusionne artefacts et constats ; renvoie (ajoutés, déjà connus, constats ajoutés)."""
    known = {(a["source"]["tool"]["name"], a["source"]["evidence_id"], a["fact_sha256"]): a["artifact_id"]
             for a in doc["artifacts"]}
    id_map: dict[str, str] = {}
    added = already = 0
    for a in result.artifacts:
        key = (a["source"]["tool"]["name"], a["source"]["evidence_id"], a["fact_sha256"])
        if key in known:  # ré-exécution : même fait, même outil, même preuve
            id_map[a["artifact_id"]] = known[key]
            already += 1
            continue
        new_id = next_id(doc["artifacts"], "artifact_id", "ART-", 6)
        id_map[a["artifact_id"]] = new_id
        a["artifact_id"] = new_id
        a["corroboration"]["sources"] = [{"tool": a["source"]["tool"]["name"], "artifact_id": new_id}]
        doc["artifacts"].append(a)
        known[key] = new_id
        added += 1

    existing_titles = {(f["type"], f["title"]) for f in doc["findings"]}
    f_added = 0
    for f in result.findings:
        f["artifact_ids"] = list(dict.fromkeys(id_map[x] for x in f["artifact_ids"] if x in id_map))
        if (f["type"], f["title"]) in existing_titles:
            continue
        f["finding_id"] = next_id(doc["findings"], "finding_id", "F-", 3)
        f["evidence_ids"] = list(dict.fromkeys(
            a["source"]["evidence_id"] for a in doc["artifacts"] if a["artifact_id"] in f["artifact_ids"]))
        doc["findings"].append(f)
        f_added += 1
    return added, already, f_added


def run_wrapper(case: Case, wrapper: ToolWrapper, extraction: Path, options: dict[str, Any] | None = None,
                *, evidence_path: Path | None = None, evidence_label: str | None = None,
                evidence_type: str = "extraction") -> RunOutcome:
    options = dict(options or {})
    label = LABELS.get(wrapper.name, wrapper.name)
    actor = case.auth.examiner
    doc = case.load()
    ev_path = Path(evidence_path or extraction)

    # 1. Preuve
    try:
        evidence_id = register_or_verify(doc, case.root, ev_path, label=evidence_label or f"Extraction {ev_path.name}",
                                         etype=evidence_type, actor=actor, purpose=f"analyse {label}")
    except IntegrityError:
        case.audit.append("integrity_failure", {"path": str(ev_path), "tool": label})
        raise
    run_id = next_id([r for r in doc["tool_runs"] if r["run_id"].startswith(f"RUN-{label.upper()}-")],
                     "run_id", f"RUN-{label.upper()}-", 2)
    out_dir = case.root / "parsed" / wrapper.name / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    options.setdefault("ioc_store", case.root / "custody" / "iocs")
    started = utc_now_iso()

    def _record(status: str, message: str, tool: dict, **extra: Any) -> dict:
        run = {"run_id": run_id, "tool": tool, "command": extra.pop("command", []), "started_at": started,
               "ended_at": utc_now_iso(), "status": status, "message": message, "input_evidence_ids": [evidence_id],
               "output_path": _rel(case.root, out_dir), "artifacts_produced": extra.pop("artifacts", 0),
               "output_sha256": extra.pop("output_sha256", None), "tool_mode": extra.pop("mode", None)}
        doc["tool_runs"].append(run)
        return run

    # 2. Exécution
    try:
        result = wrapper.run(Path(extraction), out_dir,
                             RunContext(run_id, evidence_id, options))
    except ToolUnavailable as exc:
        log.warning("%s : %s — étape ignorée.", label, exc)
        _record("skipped", f"{label} non disponible sur le poste : {exc}", {"name": label, "version": None})
        case.save(doc, reason=f"tool_skipped_{wrapper.name}")
        case.audit.append("tool_skipped", {"tool": label, "run_id": run_id, "reason": str(exc)})
        return RunOutcome(run_id, "skipped", str(exc))
    except (ToolFailed, IocFileError) as exc:
        log.error("%s : échec — %s", label, exc)
        _record("failed", f"Échec : {exc}", {"name": label, "version": None})
        case.save(doc, reason=f"tool_failed_{wrapper.name}")
        case.audit.append("tool_failed", {"tool": label, "run_id": run_id, "reason": str(exc)})
        return RunOutcome(run_id, "failed", str(exc))

    # 3. Preuves complémentaires (fichiers d'IOC utilisés) + custody
    for extra in result.extra_evidence:
        register_or_verify(doc, case.root, extra, label=f"Jeu d'IOC {extra.name}", etype="ioc_set", actor=actor,
                           purpose=f"indicateurs fournis à {label}")
    record_parsed(doc, evidence_id, actor, f"{label} {result.tool.get('version') or ''}".strip())

    # 4. Fragment normalisé (sortie du wrapper, avant fusion)
    fragment = out_dir / "veritrace_normalized.json"
    fragment.write_text(json.dumps({"run_id": run_id, "tool": result.tool, "mode": result.mode,
                                    "evidence_id": evidence_id, "artifacts": result.artifacts,
                                    "findings": result.findings, "notes": result.notes},
                                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # 5. Fusion, corrélation, sauvegarde
    added, already, f_added = _merge(doc, result, run_id)
    message = " ".join(result.notes + ([f"{already} artefact(s) déjà présent(s) (ré-exécution) non dupliqué(s)."]
                                       if already else []))
    _record("success", message, result.tool, command=result.command, artifacts=added, mode=result.mode,
            output_sha256=sha256_path(result.output_path) if result.output_path and result.output_path.exists() else None)
    summary = correlate(doc)
    case.save(doc, reason=f"ingest_{wrapper.name}")
    case.audit.append("tool_ingested", {"tool": label, "run_id": run_id, "mode": result.mode,
                                        "evidence_id": evidence_id, "artifacts_added": added,
                                        "findings_added": f_added, "fragment": _rel(case.root, fragment),
                                        "correlation": summary.as_dict()})
    log.info("%s : %d artefact(s) ajouté(s), %d constat(s) ; %d fait(s) unique(s), %d corroboré(s).",
             label, added, f_added, summary.facts, summary.corroborated_facts)
    return RunOutcome(run_id, "success", message, added, already, f_added, summary.as_dict())


def run_correlation(case: Case) -> dict[str, int]:
    doc = case.load()
    summary = correlate(doc)
    case.save(doc, reason="correlation")
    case.audit.append("correlation_run", summary.as_dict())
    return summary.as_dict()
