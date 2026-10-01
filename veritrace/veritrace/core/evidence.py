"""Éléments de preuve (`acquisitions[].items[]`) et chaîne de custody du format pivot.

- Un fichier est haché directement (SHA-256).
- Un dossier est haché via son manifeste `sha256sum` (chemins triés), écrit dans
  `custody/manifests/<ITEM-ID>.sha256sum` : revérifiable sans Veritrace (`sha256sum -c`) ;
  l'empreinte du dossier = SHA-256 de ce manifeste.
- Tout élément entre dans l'affaire par une acquisition : collecte ADB, ou acquisition
  « import » pour une extraction, une base Autopsy ou un fichier d'IOC remis à Veritrace.
- Avant chaque analyse, l'empreinte est recalculée : toute différence lève
  `IntegrityError` et AUCUNE analyse n'est lancée (principe de non-altération).
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from veritrace import __version__
from veritrace.core.hashing import manifest_text, sha256_bytes, sha256_file, tree_manifest
from veritrace.core.timeutil import utc_now_iso
from veritrace.schema.pivot import iter_items


class IntegrityError(RuntimeError):
    pass


def next_id(items: list[dict], key: str, prefix: str, width: int) -> str:
    n = 0
    pattern = re.compile(re.escape(prefix) + r"(\d+)$")  # « F-012 » oui ; « F-R4-a0976e9839 » non
    for it in items:
        m = pattern.match(str(it.get(key, "")))
        if m:
            n = max(n, int(m.group(1)))
    return f"{prefix}{n + 1:0{width}d}"


def next_item_id(doc: dict[str, Any]) -> str:
    return next_id([it for _, it in iter_items(doc)], "item_id", "EV-", 3)


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
            manifest_out.write_text(text, encoding="utf-8", newline="\n")  # LF : sha256sum -c, empreinte identique sur tout OS
        return sha256_bytes(text.encode("utf-8")), sum(size for _, _, size in manifest)
    return sha256_file(path), path.stat().st_size


def custody(doc: dict, item_id: str, action: str, actor: str, sha: str, notes: str,
            location: str = "Poste d'analyse Veritrace") -> dict:
    ev = {"event_id": next_id(doc["chain_of_custody"], "event_id", "COC-", 3), "timestamp": utc_now_iso(),
          "item_id": item_id, "action": action, "actor": actor, "sha256": sha, "location": location, "notes": notes}
    doc["chain_of_custody"].append(ev)
    return ev


def make_read_only(path: Path) -> None:
    """Fichiers collectés en lecture seule (0444) : protection contre la modification accidentelle."""
    files = [path] if path.is_file() else [p for p in path.rglob("*") if p.is_file()]
    for f in files:
        f.chmod(0o444)


def add_item(doc: dict[str, Any], case_root: Path, acquisition: dict[str, Any], path: Path, *, label: str,
             itype: str, actor: str, device_path: str | None, location: str, notes: str,
             read_only: bool = False) -> str:
    """Hache `path`, l'ajoute aux items de `acquisition` et consigne la « collecte »."""
    # L'acquisition peut ne pas encore être rattachée au document : on compte aussi ses items.
    pool = [it for _, it in iter_items(doc)] + list(acquisition["items"])
    item_id = next_id(pool, "item_id", "EV-", 3)
    manifest = case_root / "custody" / "manifests" / f"{item_id}.sha256sum" if path.is_dir() else None
    sha, size = hash_evidence(path, manifest)
    if read_only:
        make_read_only(path)
    acquisition["items"].append({
        "item_id": item_id, "label": label, "type": itype, "path": _rel(case_root, path), "device_path": device_path,
        "sha256": sha, "size_bytes": size, "collected_at": utc_now_iso(), "collected_by": actor,
    })
    if manifest:
        notes += f" Dossier : empreinte = SHA-256 du manifeste {_rel(case_root, manifest)} (une ligne par fichier)."
    custody(doc, item_id, "collecte", actor, sha, notes, location)
    return item_id


def register_or_verify(doc: dict[str, Any], case_root: Path, path: Path, *, label: str, etype: str,
                       actor: str, purpose: str) -> str:
    """Revérifie un élément déjà connu (même chemin) ou l'importe ; renvoie son item_id."""
    if not path.exists():
        raise FileNotFoundError(f"élément introuvable : {path}")
    local = _rel(case_root, path)
    existing = next((it for _, it in iter_items(doc) if it["path"] == local), None)
    if existing:
        sha, _ = hash_evidence(path)
        if sha != existing["sha256"]:
            raise IntegrityError(
                f"{existing['item_id']} ({local}) : empreinte actuelle {sha} ≠ empreinte de collecte "
                f"{existing['sha256']} — la preuve a été modifiée, analyse refusée.")
        custody(doc, existing["item_id"], "verification", actor, sha, f"Empreinte revérifiée avant : {purpose}.")
        return existing["item_id"]

    now = utc_now_iso()
    acq = {"acquisition_id": next_id(doc["acquisitions"], "acquisition_id", "ACQ-", 2), "method": "import",
           "tool": {"name": "veritrace", "version": __version__}, "operator": actor, "started_at": now,
           "ended_at": now, "status": "succes", "notes": f"Import pour {purpose}.", "items": []}
    doc["acquisitions"].append(acq)
    return add_item(doc, case_root, acq, path, label=label, itype=etype, actor=actor, device_path=None,
                    location="Poste d'analyse Veritrace", notes=f"Import pour analyse ({purpose}).")


def record_parsed(doc: dict[str, Any], item_id: str, actor: str, tool_label: str) -> None:
    it = next(i for _, i in iter_items(doc) if i["item_id"] == item_id)
    custody(doc, item_id, "analyse", actor, it["sha256"], f"Analyse par {tool_label}.")
