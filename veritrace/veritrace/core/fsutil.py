"""Utilitaires de fichiers portables (Windows, macOS, Linux)."""
from __future__ import annotations

import os
import shutil
import stat
import sys
from pathlib import Path


def force_rmtree(path: Path) -> None:
    """Supprime un dossier de travail, y compris les fichiers mis en lecture seule par Veritrace
    (sous Windows, l'attribut « lecture seule » empêche sinon la suppression)."""
    def _retry(func, p, _exc):
        try:
            os.chmod(p, stat.S_IWRITE | stat.S_IREAD)
            func(p)
        except OSError:
            pass

    if not Path(path).exists():
        return
    if sys.version_info >= (3, 12):
        shutil.rmtree(path, onexc=_retry)
    else:  # pragma: no cover - Python 3.10 / 3.11
        shutil.rmtree(path, onerror=_retry)
