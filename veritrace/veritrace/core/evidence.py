"""Enregistrement et vérification des éléments de preuve dans le JSON de l'affaire.

- Un fichier est haché directement (SHA-256).
- Un dossier (extraction « fs ») est haché via son manifeste `sha256sum` (chemins
  triés), écrit dans `custody/manifests/<EV-ID>.sha256sum` : il peut être revérifié sans
  Veritrace (`sha256sum -c`), et l'empreinte du dossier = SHA-256 de ce manifeste.
- Avant chaque analyse, l'empreinte est recalculée : toute différence lève
  `IntegrityError` et AUCUNE analyse n'est lancée (principe de non-altération).
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from veritrace.core.hashing import manifest_text, sha256_bytes, sha256_file, tree_manifest
from veritrace.core.timeutil import utc_now_iso


class IntegrityError(RuntimeError):
    pass


def next_id(items: list[dict], key: str, prefix: str, width: int) -> str:
    n = 0
    for it in items:
        m = re.search(r"(\d+)$", str(it.get(key, "")))
        if m and str(it.get(key, "")).startswith(prefix):
            n = max(n, int(m.group(1)))
    return f"{prefix}{n + 1:0{width}d}"


def _rel(case_root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(case_root.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def hash_evidence(path: Path, manifest_out: Path | None = None) -> tuple[str, int]:
    """(sha256, taille) ; pour un dossier, écrit le manifeste si `manifest_out`."""
    if path.is_dir():
        manifest = tree_manifest(path)
        text = manifest_text(manifest)
        if manifest_out is not None:
            manifest_out.parent.mkdir(parents=True, exist_ok=True)
            manifest_out.write_text(text, encoding="utf-8")
        return sha256_bytes(text.encode("utf-8")), sum(size for _, _, size in manifest)
    return sha256_file(path), path.stat().st_size


def _custody(doc: dict, evidence_id: str, action: str, actor: str, sha: str, notes: str) -> dict:
    ev = {"event_id": next_id(doc["custody_chain"], "event_id", "COC-", 3), "timestamp": utc_now_iso(),
          "evidence_id": evidence_id, "action": action, "actor": actor, "sha256": sha,
          "location": "Poste d'analyse Veritrace", "notes": notes}
    doc["custody_chain"].append(ev)
    return ev


def register_or_verify(doc: dict[str, Any], case_root: Path, path: Path, *, label: str, etype: str,
                       actor: str, purpose: str) -> str:
    """Enregistre `path` comme preuve (si nouveau) ou revérifie son empreinte ; renvoie l'ID."""
    if not path.exists():
        raise FileNotFoundError(f"élément introuvable : {path}")
    local = _rel(case_root, path)
    existing = next((e for e in doc["evidence_items"] if e["local_path"] == local), None)
    if existing:
        sha, _ = hash_evidence(path)
        if sha != existing["sha256"]:
            raise IntegrityError(
                f"{existing['evidence_id']} ({local}) : empreinte actuelle {sha} ≠ empreinte de collecte "
                f"{existing['sha256']} — la preuve a été modifiée, analyse refusée.")
        _custody(doc, existing["evidence_id"], "verified", actor, sha, f"Empreinte revérifiée avant : {purpose}.")
        return existing["evidence_id"]

    evidence_id = next_id(doc["evidence_items"], "evidence_id", "EV-", 3)
    manifest = case_root / "custody" / "manifests" / f"{evidence_id}.sha256sum" if path.is_dir() else None
    sha, size = hash_evidence(path, manifest)
    doc["evidence_items"].append({
        "evidence_id": evidence_id, "acquisition_id": None, "label": label, "type": etype, "local_path": local,
        "device_path": None, "sha256": sha, "size_bytes": size, "collected_at": utc_now_iso(), "collected_by": actor,
    })
    note = f"Enregistrement pour analyse ({purpose})."
    if manifest:
        note += f" Dossier : empreinte = SHA-256 du manifeste {_rel(case_root, manifest)}."
    _custody(doc, evidence_id, "collected", actor, sha, note)
    return evidence_id


def record_parsed(doc: dict[str, Any], evidence_id: str, actor: str, tool_label: str) -> None:
    ev = next(e for e in doc["evidence_items"] if e["evidence_id"] == evidence_id)
    _custody(doc, evidence_id, "parsed", actor, ev["sha256"], f"Analyse par {tool_label}.")
