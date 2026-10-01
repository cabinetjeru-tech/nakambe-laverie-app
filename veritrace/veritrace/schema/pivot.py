"""Vocabulaire et accesseurs du format pivot (schéma veritrace_pivot.schema.json).

Point unique pour les valeurs d'énumération et la lecture des extensions `x_veritrace`,
afin que wrappers, corrélation, acquisition et rapports parlent exactement le même format.
"""
from __future__ import annotations

from typing import Any, Iterator

SCHEMA_VERSION = "1.0.0"

AUTH_TYPES = ("consentement", "mandat", "ordre_judiciaire", "politique-entreprise")
CATEGORIES = ("sms", "appel", "contact", "navigation", "localisation", "exif", "usage_app", "application", "wifi",
              "bluetooth", "compte", "ioc", "autre")
SEVERITIES = ("critique", "eleve", "moyen", "faible", "info")          # ordre décroissant
FINDING_TYPES = ("ioc", "application_suspecte", "anomalie", "observation")
CUSTODY_ACTIONS = ("collecte", "verification", "copie", "transfert", "stockage", "analyse", "rapport", "scelle",
                   "restitution")
ACQ_STATUS = ("succes", "partiel", "echec")
RUN_STATUS = ("succes", "avertissement", "echec", "ignore")
PRIORITIES = ("immediat", "court_terme", "moyen_terme")
ITEM_TYPES = ("extraction", "sauvegarde", "fichier", "archive", "document", "sortie_outil", "ioc")


# --------------------------------------------------------------------------- extensions
def ext(obj: dict[str, Any] | None) -> dict[str, Any]:
    """Bloc x_veritrace d'un objet (vide si absent)."""
    return (obj or {}).get("x_veritrace") or {}


def ext_set(obj: dict[str, Any], **values: Any) -> dict[str, Any]:
    """Écrit des valeurs dans x_veritrace (en omettant les None)."""
    x = obj.setdefault("x_veritrace", {})
    for k, v in values.items():
        if v is not None:
            x[k] = v
    return x


def root_ext(doc: dict[str, Any]) -> dict[str, Any]:
    return doc.setdefault("x_veritrace", {})


def tool_runs(doc: dict[str, Any]) -> list[dict[str, Any]]:
    return root_ext(doc).setdefault("tool_runs", [])


# --------------------------------------------------------------------------- éléments de preuve
def iter_items(doc: dict[str, Any]) -> Iterator[tuple[dict[str, Any], dict[str, Any]]]:
    """(acquisition, item) pour chaque élément de preuve."""
    for acq in doc.get("acquisitions") or []:
        for it in acq.get("items") or []:
            yield acq, it


def items_index(doc: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {it["item_id"]: it for _, it in iter_items(doc)}


# --------------------------------------------------------------------------- artefacts
def engine(art: dict[str, Any]) -> str:
    """Moteur d'analyse réel (Autopsy via aLEAPP = ALEAPP : pas une source indépendante)."""
    return ext(art).get("engine") or (art.get("source") or {}).get("tool") or "?"


def fact_sha(art: dict[str, Any]) -> str:
    """Empreinte du fait : extension si présente, sinon recalculée à partir des données."""
    from veritrace.schema.facts import fact_hash

    return ext(art).get("fact_sha256") or fact_hash(art["category"], art.get("data") or {}, art.get("timestamp"))
