"""Horodatage : tout est stocké en UTC ISO-8601 avec fuseau explicite."""
from __future__ import annotations

from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    """Ex. 2026-10-01T09:12:44.123456+00:00 — précision microseconde pour l'audit."""
    return utc_now().isoformat(timespec="microseconds")


def parse_iso(value: str) -> datetime:
    """Parse un horodatage ISO-8601 ; accepte le suffixe 'Z'. Lève ValueError sinon."""
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)
