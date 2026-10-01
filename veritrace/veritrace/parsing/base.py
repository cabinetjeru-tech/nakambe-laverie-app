"""Contrat commun des wrappers d'outils.

Un wrapper :
1. vérifie la présence de son outil (`core.tools.require`) — absent → exécution « skipped »
   consignée, avertissement, AUCUNE exception ;
2. exécute l'outil sur des preuves identifiées par `evidence_id` (jamais sur des chemins libres) ;
3. convertit la sortie en artefacts normalisés via `make_artifact` (qui calcule
   `content_sha256` avec la même fonction que le validateur → corroboration fiable).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from veritrace.schema.validator import content_hash


@dataclass
class WrapperResult:
    tool_run: dict[str, Any]
    artifacts: list[dict[str, Any]] = field(default_factory=list)


def make_artifact(*, artifact_id: str, category: str, timestamp: str | None, tool: dict[str, Any],
                  run_id: str, evidence_id: str, data: dict[str, Any], file_path: str | None = None,
                  record_ref: str | None = None, tags: list[str] | None = None) -> dict[str, Any]:
    return {
        "artifact_id": artifact_id,
        "category": category,
        "timestamp": timestamp,
        "source": {"tool": tool, "run_id": run_id, "evidence_id": evidence_id,
                   "file_path": file_path, "record_ref": record_ref},
        "data": data,
        "content_sha256": content_hash(category, data),
        "corroboration": {"status": "single_source", "sources": [{"tool": tool["name"], "artifact_id": artifact_id}]},
        "tags": tags or [],
    }


class ToolWrapper(ABC):
    #: clé dans core.tools.TOOLS (ou None pour un parseur natif)
    tool_key: str | None = None

    @abstractmethod
    def run(self, case_root, evidence: list[dict[str, Any]], run_id: str) -> WrapperResult:
        """Exécute l'outil et renvoie l'exécution + les artefacts normalisés."""
