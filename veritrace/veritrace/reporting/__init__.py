"""Reporting : JSON normalisé → modèle de rapport → Markdown / PDF.

Point d'entrée : `generate()`. Le document est toujours re-validé avant rendu ; un JSON
non conforme ne produit aucun rapport.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from veritrace.core.hashing import sha256_bytes, sha256_file
from veritrace.core.logging_setup import get_logger
from veritrace.core.timeutil import utc_now
from veritrace.reporting.markdown import render_markdown
from veritrace.reporting.model import TEMPLATES, build_report_model
from veritrace.schema.validator import ensure_valid

log = get_logger("reporting")

FORMATS = ("md", "pdf")


@dataclass
class GeneratedReport:
    template: str
    source_sha256: str
    outputs: dict[str, Path]         # format -> chemin
    output_sha256: dict[str, str]    # format -> SHA-256 du fichier produit
    manifest: Path


def generate(json_path: str | Path, *, template: str, out_dir: str | Path, formats: tuple[str, ...] = FORMATS,
             case_root: str | Path | None = None, verify_files: bool = False) -> GeneratedReport:
    """Génère le(s) rapport(s) depuis un JSON normalisé.

    case_root    : racine du dossier d'affaire (logo relatif, vérification des fichiers).
    verify_files : re-hache chaque preuve sur disque avant de produire le rapport.
    """
    if template not in TEMPLATES:
        raise ValueError(f"Gabarit inconnu « {template} »")
    unknown = set(formats) - set(FORMATS)
    if unknown:
        raise ValueError(f"Format(s) inconnu(s) : {', '.join(sorted(unknown))}")

    raw = Path(json_path).read_bytes()
    source_sha = sha256_bytes(raw)
    doc = json.loads(raw.decode("utf-8"))
    report = ensure_valid(doc, case_root=case_root if verify_files else None)
    for w in report.warnings:
        log.warning("%s", w)

    model = build_report_model(doc, template, source_sha256=source_sha,
                               case_root=Path(case_root) if case_root else None)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = utc_now().strftime("%Y%m%dT%H%M%SZ")
    base = out_dir / f"{doc['case']['case_id']}_{template}_{stamp}"

    outputs: dict[str, Path] = {}
    if "md" in formats:
        p = base.with_suffix(".md")
        p.write_text(render_markdown(model), encoding="utf-8", newline="\n")
        outputs["md"] = p
    if "pdf" in formats:
        from veritrace.reporting.pdf import render_pdf  # import tardif : ReportLab optionnel pour le MD
        outputs["pdf"] = render_pdf(model, base.with_suffix(".pdf"))

    hashes = {fmt: sha256_file(p) for fmt, p in outputs.items()}
    manifest = base.with_suffix(".manifest.json")
    manifest.write_text(json.dumps({
        "case_id": doc["case"]["case_id"], "template": template, "generated_at": model.generated_at,
        "source": {"path": str(json_path), "sha256": source_sha},
        "outputs": {fmt: {"file": p.name, "sha256": hashes[fmt]} for fmt, p in outputs.items()},
        "generator": model.footer,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

    for fmt, p in outputs.items():
        log.info("Rapport %s (%s) : %s", template, fmt.upper(), p)
    return GeneratedReport(template, source_sha, outputs, hashes, manifest)
