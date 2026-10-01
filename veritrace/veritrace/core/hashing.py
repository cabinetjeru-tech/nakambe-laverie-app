"""Fonctions de hachage utilisées pour l'intégrité des preuves et le dédoublonnage.

- `sha256_file` : empreinte d'un fichier collecté (lecture en flux, fichiers volumineux OK).
- `canonical_json` / `sha256_json` : empreinte stable d'un objet JSON. Deux outils qui
  décrivent le même fait avec les mêmes données normalisées produisent la même empreinte,
  ce qui sert au marquage « corroboré ».
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

_CHUNK = 1024 * 1024  # 1 Mio


def sha256_file(path: str | Path) -> str:
    """SHA-256 hexadécimal (minuscule) du contenu d'un fichier."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(_CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_json(obj: Any) -> str:
    """Sérialisation déterministe : clés triées, sans espaces, UTF-8 non échappé."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_json(obj: Any) -> str:
    return sha256_bytes(canonical_json(obj).encode("utf-8"))


def tree_manifest(root: str | Path) -> list[tuple[str, str, int]]:
    """(chemin relatif POSIX, sha256, taille) de chaque fichier d'une arborescence, trié."""
    root = Path(root)
    out = []
    for p in sorted(root.rglob("*")):
        if p.is_file() and not p.is_symlink():
            out.append((p.relative_to(root).as_posix(), sha256_file(p), p.stat().st_size))
    return out


def manifest_text(manifest: list[tuple[str, str, int]]) -> str:
    """Format compatible `sha256sum -c` (deux espaces entre empreinte et chemin)."""
    return "".join(f"{h}  {rel}\n" for rel, h, _ in manifest)


def sha256_tree(root: str | Path) -> str:
    """Empreinte d'un dossier = SHA-256 de son manifeste `sha256sum` (chemins triés).

    Vérifiable indépendamment : `sha256sum -c manifeste` puis SHA-256 du manifeste.
    """
    return sha256_bytes(manifest_text(tree_manifest(root)).encode("utf-8"))


def sha256_path(path: str | Path) -> str:
    """SHA-256 d'un fichier, ou empreinte d'arborescence pour un dossier."""
    path = Path(path)
    return sha256_tree(path) if path.is_dir() else sha256_file(path)
