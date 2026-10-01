"""Détection des outils externes (ADB, ALEAPP, MVT, Autopsy).

Règle : un outil absent produit un avertissement, jamais un crash. Les modules qui en
dépendent consultent `ToolStatus.available` et consignent une exécution « skipped ».
"""
from __future__ import annotations

import os
import shutil
import subprocess
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
    "mvt": ToolSpec("mvt", "Mobile Verification Toolkit", ("mvt-android",), ("version",), "VERITRACE_MVT",
                    "Détection spyware/stalkerware via IOC"),
    "autopsy": ToolSpec("autopsy", "Autopsy", ("autopsy", "autopsy64.exe", "autopsy.exe"), ("--version",),
                        "VERITRACE_AUTOPSY", "Analyse complémentaire / ingestion"),
}


def _probe_version(path: str, args: tuple[str, ...]) -> str | None:
    try:
        out = subprocess.run([path, *args], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.debug("Version de %s non lisible : %s", path, exc)
        return None
    text = (out.stdout or out.stderr or "").strip()
    return text.splitlines()[0][:200] if text else None


def detect(key: str) -> ToolStatus:
    spec = TOOLS[key]
    path = os.environ.get(spec.env_var) or next(
        (p for p in (shutil.which(e) for e in spec.executables) if p), None
    )
    if not path or not os.path.exists(path):
        msg = (f"{spec.label} introuvable (PATH ou ${spec.env_var}). "
               f"Fonction concernée désactivée : {spec.purpose}.")
        return ToolStatus(key, spec.label, False, None, None, spec.purpose, msg)
    version = _probe_version(path, spec.version_args)
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
