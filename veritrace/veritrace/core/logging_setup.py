"""Configuration des logs lisibles (console) + fichier par affaire.

Les logs techniques sont distincts du journal d'audit : ils servent au diagnostic et
peuvent être verbeux ; l'audit, lui, trace les actions de l'examinateur et est chaîné.
"""
from __future__ import annotations

import logging
from pathlib import Path

_CONSOLE_FMT = "%(levelname)-8s %(message)s"
_FILE_FMT = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"

_configured = False


def setup_logging(verbose: bool = False) -> None:
    """Initialise le logger racine 'veritrace' (idempotent)."""
    global _configured
    logger = logging.getLogger("veritrace")
    logger.setLevel(logging.DEBUG)
    if _configured:
        return
    console = logging.StreamHandler()
    console.setLevel(logging.DEBUG if verbose else logging.INFO)
    console.setFormatter(logging.Formatter(_CONSOLE_FMT))
    logger.addHandler(console)
    logger.propagate = False
    _configured = True


def attach_case_logfile(log_dir: Path) -> None:
    """Ajoute un fichier `veritrace.log` dans le dossier de logs de l'affaire."""
    logger = logging.getLogger("veritrace")
    target = (log_dir / "veritrace.log").resolve()
    for h in logger.handlers:
        if isinstance(h, logging.FileHandler) and Path(h.baseFilename) == target:
            return
    log_dir.mkdir(parents=True, exist_ok=True)
    fh = logging.FileHandler(target, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(_FILE_FMT))
    logger.addHandler(fh)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"veritrace.{name}")
