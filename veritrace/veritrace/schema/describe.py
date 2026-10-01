"""Descriptions lisibles des artefacts (partagées par la corrélation et les rapports)."""
from __future__ import annotations

from typing import Any


CALL_FR = {"incoming": "Appel entrant", "outgoing": "Appel sortant", "missed": "Appel manqué",
           "rejected": "Appel rejeté", "blocked": "Appel bloqué"}


def _v(x: Any) -> str:
    if x is None or x == "" or x == []:
        return "—"
    if isinstance(x, list):
        return ", ".join(str(i) for i in x)
    return str(x)


def artifact_summary(a: dict[str, Any]) -> str:
    """Résumé lisible d'un artefact, selon sa catégorie."""
    d, c = a.get("data") or {}, a.get("category")
    if c == "sms":
        who = d.get("contact_name") or d.get("address")
        arrow = {"incoming": "reçu de", "outgoing": "envoyé à"}.get(d.get("direction"), "échangé avec")
        return f"SMS {arrow} {who} : « {d.get('body') or ''} »"
    if c == "call":
        kind = CALL_FR.get(d.get("direction"), "Appel")
        dur = f" ({d['duration_s']} s)" if d.get("duration_s") is not None else ""
        return f"{kind} — {d.get('contact_name') or d.get('number')}{dur}"
    if c == "contact":
        return f"{d.get('display_name')} — {_v(d.get('phone_numbers'))}"
    if c == "browser_history":
        return f"{d.get('url')} ({d.get('browser') or 'navigateur ?'})"
    if c == "location":
        acc = f" ±{d['accuracy_m']:.0f} m" if d.get("accuracy_m") is not None else ""
        return f"{d.get('latitude')}, {d.get('longitude')}{acc} ({d.get('provider') or '?'})"
    if c == "exif":
        return f"{d.get('file_path')} — {d.get('make') or ''} {d.get('model') or ''}".strip()
    if c == "app_usage":
        ev = {"foreground": "au premier plan", "background": "en arrière-plan", "launch": "lancement",
              "notification": "notification", "screen_on": "écran allumé", "screen_off": "écran éteint"}
        return f"{d.get('package')} — {ev.get(d.get('event'), d.get('event'))}"
    if c == "installed_app":
        src = d.get("installer") or "installateur inconnu (sideload ?)"
        ver = f" v{d['version_name']}" if d.get("version_name") else ""
        return f"{d.get('package')}{ver} — {src}"
    if c == "wifi":
        return f"SSID « {d.get('ssid')} » ({d.get('bssid') or 'BSSID ?'})"
    if c == "bluetooth":
        return f"{d.get('name') or 'sans nom'} [{d.get('mac')}]"
    if c == "account":
        return f"{d.get('account_name')} ({d.get('account_type')})"
    if c == "ioc_match":
        return f"{d.get('indicator_type')} « {d.get('indicator')} » — {d.get('ioc_source')}"
    return ", ".join(f"{k}={v}" for k, v in list(d.items())[:4])
