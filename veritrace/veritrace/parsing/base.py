"""Contrat commun des wrappers d'outils.

Interface identique pour ALEAPP, MVT et Autopsy :

    wrapper.run(extraction: Path, out_dir: Path, ctx: RunContext) -> WrapperResult

- **entrée** : chemin de l'extraction (dossier, archive, sauvegarde, cas Autopsy…) ;
- **sortie** : `WrapperResult` = une exécution d'outil + des artefacts et constats au
  schéma normalisé. Le runner (`parsing/runner.py`) les écrit dans
  `parsed/<outil>/<RUN-ID>/veritrace_normalized.json` puis les verse dans le JSON de
  l'affaire, avant corrélation.

Un wrapper peut soit LANCER l'outil (mode « executed »), soit IMPORTER une sortie déjà
produite (mode « imported » : `--from-output`). Si l'outil est absent et qu'aucune sortie
n'est fournie, il lève `ToolUnavailable` : le runner consigne alors une exécution
« skipped » avec un avertissement — jamais de crash.
"""
from __future__ import annotations

import subprocess
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from veritrace.core.logging_setup import get_logger
from veritrace.core.timeutil import utc_now_iso
from veritrace.schema.facts import fact_hash
from veritrace.schema.validator import content_hash

log = get_logger("parsing")


class ToolUnavailable(RuntimeError):
    """Outil non installé (et aucune sortie à importer)."""


class ToolFailed(RuntimeError):
    """L'outil s'est exécuté mais a échoué ; `log_path` contient sa sortie."""

    def __init__(self, message: str, log_path: Path | None = None) -> None:
        super().__init__(message)
        self.log_path = log_path


@dataclass
class RunContext:
    run_id: str
    evidence_id: str
    options: dict[str, Any] = field(default_factory=dict)


@dataclass
class WrapperResult:
    tool: dict[str, Any]                      # {"name", "version", "engine"?}
    mode: str                                 # executed | imported
    command: list[str]
    started_at: str
    ended_at: str
    output_path: Path | None
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    findings: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)   # remarques consignées dans tool_run.message
    extra_evidence: list[Path] = field(default_factory=list)  # ex. fichiers d'IOC utilisés


class ArtifactBuilder:
    """Fabrique d'artefacts normalisés avec identifiants LOCAUX et dédoublonnage interne.

    Un même outil peut produire plusieurs fois le même fait (ex. ALEAPP « SMS Messages » et
    « SMS and MMS Messages ») : seul le premier est conservé, les doublons sont comptés.
    """

    def __init__(self, run_id: str, evidence_id: str) -> None:
        self.run_id = run_id
        self.evidence_id = evidence_id
        self.items: list[dict[str, Any]] = []
        self._seen: dict[str, str] = {}
        self.internal_duplicates = 0

    def add(self, *, category: str, timestamp: str | None, tool: dict[str, Any], data: dict[str, Any],
            file_path: str | None = None, record_ref: str | None = None,
            tags: list[str] | None = None) -> str:
        """Ajoute (ou retrouve) un artefact ; renvoie son identifiant local."""
        data = {k: v for k, v in data.items() if v is not None or k in _KEEP_NONE}
        fact = fact_hash(category, data, timestamp)
        if fact in self._seen:
            # Même fait vu deux fois par le même outil : on complète les champs manquants
            # (ex. Wi-Fi : « WiFi Config Store » sans BSSID puis « wifiProfiles » avec).
            self.internal_duplicates += 1
            local_id = self._seen[fact]
            art = next(a for a in self.items if a["artifact_id"] == local_id)
            for k, v in data.items():
                if art["data"].get(k) in (None, "", []) and v not in (None, "", []):
                    art["data"][k] = v
            if not art["timestamp"] and timestamp:
                art["timestamp"] = timestamp
            art["content_sha256"] = content_hash(category, art["data"])
            art["fact_sha256"] = fact_hash(category, art["data"], art["timestamp"])
            self._seen[art["fact_sha256"]] = local_id
            return local_id
        local_id = f"L{len(self.items) + 1}"
        self.items.append({
            "artifact_id": local_id,
            "category": category,
            "timestamp": timestamp,
            "source": {"tool": tool, "run_id": self.run_id, "evidence_id": self.evidence_id,
                       "file_path": file_path, "record_ref": record_ref},
            "data": data,
            "content_sha256": content_hash(category, data),
            "fact_sha256": fact,
            "corroboration": {"status": "single_source",
                              "sources": [{"tool": tool["name"], "artifact_id": local_id}]},
            "tags": tags or [],
        })
        self._seen[fact] = local_id
        return local_id


# Champs dont la valeur `null` est informative (ex. installateur inconnu = sideload probable).
_KEEP_NONE = {"installer"}


def make_artifact(*, artifact_id: str, category: str, timestamp: str | None, tool: dict[str, Any],
                  run_id: str, evidence_id: str, data: dict[str, Any], file_path: str | None = None,
                  record_ref: str | None = None, tags: list[str] | None = None) -> dict[str, Any]:
    """Artefact isolé (sans dédoublonnage) — utilisé par l'exemple et les tests."""
    return {
        "artifact_id": artifact_id,
        "category": category,
        "timestamp": timestamp,
        "source": {"tool": tool, "run_id": run_id, "evidence_id": evidence_id,
                   "file_path": file_path, "record_ref": record_ref},
        "data": data,
        "content_sha256": content_hash(category, data),
        "fact_sha256": fact_hash(category, data, timestamp),
        "corroboration": {"status": "single_source", "sources": [{"tool": tool["name"], "artifact_id": artifact_id}]},
        "tags": tags or [],
    }


def run_tool(cmd: list[str], log_path: Path, *, timeout: int, cwd: Path | None = None) -> float:
    """Exécute un outil externe ; stdout/stderr → log_path. Renvoie la durée (s).

    Lève ToolFailed (code retour ≠ 0, délai dépassé, binaire introuvable).
    """
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log.info("Exécution : %s", " ".join(cmd))
    start = time.monotonic()
    with open(log_path, "w", encoding="utf-8", errors="replace") as fh:
        fh.write(f"# {utc_now_iso()} — {' '.join(cmd)}\n")
        fh.flush()
        try:
            proc = subprocess.run(cmd, stdout=fh, stderr=subprocess.STDOUT, timeout=timeout,
                                  cwd=str(cwd) if cwd else None)
        except subprocess.TimeoutExpired as exc:
            raise ToolFailed(f"délai dépassé ({timeout} s)", log_path) from exc
        except OSError as exc:
            raise ToolFailed(f"lancement impossible : {exc}", log_path) from exc
    if proc.returncode != 0:
        raise ToolFailed(f"code retour {proc.returncode} (voir {log_path.name})", log_path)
    return time.monotonic() - start


class ToolWrapper(ABC):
    #: clé dans core.tools.TOOLS
    key: str
    #: nom affiché / dossier de sortie (parsed/<name>/)
    name: str

    @abstractmethod
    def run(self, extraction: Path, out_dir: Path, ctx: RunContext) -> WrapperResult:
        """Exécute (ou importe) l'outil et renvoie un résultat normalisé."""
