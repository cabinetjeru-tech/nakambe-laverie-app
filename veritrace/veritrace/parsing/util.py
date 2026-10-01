"""Utilitaires de conversion communs aux wrappers."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

_TAG = re.compile(r"<[^>]+>")


def to_iso(value: Any) -> str | None:
    """Convertit un horodatage d'outil en ISO-8601 UTC (None si vide/illisible).

    Accepte : epoch (s ou ms), « AAAA-MM-JJ HH:MM:SS[.f][±HH:MM] » (sans fuseau → UTC,
    convention ALEAPP/MVT), ISO-8601.
    """
    if value in (None, "", " ", 0, "0"):
        return None
    if isinstance(value, (int, float)) or (isinstance(value, str) and re.fullmatch(r"-?\d+(\.\d+)?", value.strip())):
        n = float(value)
        if n <= 0:
            return None
        if n > 1e11:  # millisecondes
            n /= 1000
        return datetime.fromtimestamp(n, timezone.utc).isoformat()
    s = str(value).strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def clean(value: Any) -> str | None:
    """Texte nettoyé (balises HTML d'affichage retirées) ; None si vide."""
    if value is None:
        return None
    s = _TAG.sub("", str(value)).strip()
    return s or None


def to_int(value: Any) -> int | None:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def to_float(value: Any) -> float | None:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None
