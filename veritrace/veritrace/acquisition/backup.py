"""Lecture du format de sauvegarde Android (`adb backup`, fichier .ab).

En-tête texte de 4 lignes puis flux tar (compressé zlib si « 1 ») :

    ANDROID BACKUP
    <version>
    <compressé : 0|1>
    <chiffrement : none|AES-256>

`ab_to_tar` produit une COPIE DÉRIVÉE au format tar (l'original .ab reste intact et
haché). Une sauvegarde chiffrée n'est pas convertie : Veritrace ne tente aucune
récupération de mot de passe ; le mot de passe doit être fourni à MVT par l'examinateur
(`mvt-android check-backup -p`) si le titulaire l'a communiqué.
"""
from __future__ import annotations

import tarfile
import zlib
from pathlib import Path

MAGIC = b"ANDROID BACKUP\n"


class BackupError(ValueError):
    pass


class BackupEncrypted(BackupError):
    pass


def read_header(path: Path) -> dict[str, str]:
    with open(path, "rb") as fh:
        if fh.readline() != MAGIC:
            raise BackupError(f"{path.name} : ce n'est pas une sauvegarde Android (en-tête absent)")
        version = fh.readline().strip().decode()
        compressed = fh.readline().strip().decode()
        encryption = fh.readline().strip().decode()
    return {"version": version, "compressed": compressed, "encryption": encryption}


def ab_to_tar(src: Path, dest: Path) -> int:
    """Convertit `src` (.ab) en `dest` (.tar) ; renvoie le nombre d'entrées du tar."""
    header = read_header(src)
    if header["encryption"].lower() != "none":
        raise BackupEncrypted(f"{src.name} : sauvegarde chiffrée ({header['encryption']}) — non convertie")
    with open(src, "rb") as fin, open(dest, "wb") as fout:
        for _ in range(4):
            fin.readline()
        dec = zlib.decompressobj() if header["compressed"] == "1" else None
        while chunk := fin.read(1024 * 1024):
            fout.write(dec.decompress(chunk) if dec else chunk)
        if dec:
            fout.write(dec.flush())
    try:
        with tarfile.open(dest) as tf:
            return len(tf.getmembers())
    except tarfile.TarError:
        return 0  # sauvegarde vide : flux tar absent ou réduit à sa fin
