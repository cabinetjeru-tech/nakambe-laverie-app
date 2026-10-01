"""Détection des outils externes (ADB, ALEAPP, MVT, Autopsy).

Règle : un outil absent produit un avertissement, jamais un crash. Les modules qui en
dépendent consultent `ToolStatus.available` et consignent une exécution « skipped ».
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass

from veritrace.core.logging_setup import get_logger

log = get_logger("tools")


@dataclass(frozen=True)
class ToolSpec:
    key: str
    label: str
    executables: tuple[str, ...]          # noms candidats dans le PATH
    version_args: tuple[str, ...]         # arguments pour obtenir la version
    env_var: str                          # variable d'environnement pour forcer un chemin
    purpose: str


@dataclass
class ToolStatus:
    key: str
    label: str
    available: bool
    path: str | None
    version: str | None
    purpose: str
    message: str = ""


TOOLS: dict[str, ToolSpec] = {
    "adb": ToolSpec("adb", "Android Debug Bridge", ("adb",), ("version",), "VERITRACE_ADB",
                    "Acquisition logique (backup, pull ciblé)"),
    "aleapp": ToolSpec("aleapp", "ALEAPP", ("aleapp", "aleapp.py"), ("--version",), "VERITRACE_ALEAPP",
                       "Parsing d'artefacts Android"),
    "mvt": ToolSpec("mvt", "Mobile Verification Toolkit", ("mvt-android",), ("--disable-update-check", "version"),
                    "VERITRACE_MVT",
                    "Détection spyware/stalkerware via IOC"),
    # Autopsy est une application graphique : pas de sonde de version (elle ouvrirait l'interface).
    # Son absence n'empêche pas l'import d'un cas Autopsy exporté (lecture de autopsy.db).
    "autopsy": ToolSpec("autopsy", "Autopsy", ("autopsy", "autopsy64.exe", "autopsy.exe"), (),
                        "VERITRACE_AUTOPSY", "Ingest Android (import du cas possible sans l'application)"),
}


def _probe_version(path: str, args: tuple[str, ...]) -> str | None:
    """Première ligne utile de `<outil> --version` (ou équivalent) ; None si illisible."""
    cmd = [path, *args]
    cwd = None
    if path.endswith(".py"):  # ALEAPP lancé depuis ses sources
        cmd = [os.environ.get("VERITRACE_ALEAPP_PYTHON") or sys.executable, *cmd]
        cwd = os.path.dirname(path) or None
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60, cwd=cwd)
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.debug("Version de %s non lisible : %s", path, exc)
        return None
    lines = [l.strip() for l in (out.stdout + "\n" + out.stderr).splitlines() if l.strip()]
    for l in lines:
        m = re.search(r"Version:?\s+(\d\S*)", l)  # MVT « Version: x », adb « Version 35.0.2-… »
        if m:
            return m.group(1)
    for l in lines:
        m = re.search(r"(\d+\.\d+(?:\.\d+)*)", l)
        if m:
            return m.group(1)
    return lines[0][:200] if lines else None


def detect(key: str) -> ToolStatus:
    spec = TOOLS[key]
    path = os.environ.get(spec.env_var) or next(
        (p for p in (shutil.which(e) for e in spec.executables) if p), None
    )
    if not path or not os.path.exists(path):
        msg = (f"{spec.label} introuvable (PATH ou ${spec.env_var}). "
               f"Fonction concernée désactivée : {spec.purpose}.")
        return ToolStatus(key, spec.label, False, None, None, spec.purpose, msg)
    version = _probe_version(path, spec.version_args) if spec.version_args else None
    return ToolStatus(key, spec.label, True, path, version, spec.purpose, "OK")


def detect_all() -> list[ToolStatus]:
    return [detect(k) for k in TOOLS]


def require(key: str) -> ToolStatus | None:
    """Renvoie le statut si l'outil est disponible ; sinon avertit et renvoie None."""
    status = detect(key)
    if not status.available:
        log.warning(status.message)
        return None
    return status
