"""Assemble l'archive de distribution d'une plateforme.

    python packaging/bundle.py <plateforme>      # ex. windows-x64, linux-x64, macos-arm64

Contenu : exécutable autonome, scripts d'installation, guide utilisateur, README, licence,
changelog. Écrit dist/veritrace-<version>-<plateforme>.zip et affiche son SHA-256.
"""
from __future__ import annotations

import hashlib
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from veritrace import __version__  # noqa: E402


def main(platform: str) -> Path:
    windows = platform.startswith("windows")
    exe = ROOT / "packaging" / "dist" / ("veritrace.exe" if windows else "veritrace")
    if not exe.is_file():
        raise SystemExit(f"Exécutable absent : {exe} (lancer PyInstaller d'abord)")
    folder = f"veritrace-{__version__}-{platform}"
    out = ROOT / "dist" / f"{folder}.zip"
    out.parent.mkdir(exist_ok=True)
    inst = ROOT / "packaging" / "install"
    files = [(exe, exe.name), (ROOT / "GUIDE_UTILISATEUR.md", "GUIDE_UTILISATEUR.md"),
             (ROOT / "README.md", "README.md"), (ROOT / "LICENSE", "LICENSE.txt"),
             (ROOT / "CHANGELOG.md", "CHANGELOG.md")]
    files += [(inst / "install.ps1", "install.ps1"), (inst / "install.cmd", "install.cmd")] if windows else \
             [(inst / "install.sh", "install.sh")]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for src, name in files:
            info = zipfile.ZipInfo.from_file(src, f"{folder}/{name}")
            if name in ("veritrace", "install.sh"):
                info.external_attr = (0o755 & 0xFFFF) << 16       # exécutable après décompression
            with open(src, "rb") as fh:
                zf.writestr(info, fh.read(), zipfile.ZIP_DEFLATED)
    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    print(f"{digest}  {out.name}")
    return out


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "linux-x64")
