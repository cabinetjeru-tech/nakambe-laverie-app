"""Descriptions lisibles des artefacts du format pivot (corrélation et rapports)."""
from __future__ import annotations

from typing import Any

DIRECTION_FR = {"entrant": "entrant", "sortant": "sortant", "manque": "manqué", "rejete": "rejeté",
                "bloque": "bloqué", "inconnu": "de direction inconnue"}
USAGE_FR = {"premier_plan": "au premier plan", "arriere_plan": "en arrière-plan", "lancement": "lancement",
            "notification": "notification", "ecran_allume": "écran allumé", "ecran_eteint": "écran éteint",
            "autre": "autre événement"}
IOC_TYPE_FR = {"application": "application", "domaine": "domaine", "url": "URL", "processus": "processus",
               "empreinte_fichier": "empreinte de fichier", "certificat": "certificat", "chemin_fichier": "fichier",
               "autre": "indicateur"}


def _v(x: Any) -> str:
    if x is None or x == "" or x == []:
        return "—"
    if isinstance(x, list):
        return ", ".join(str(i) for i in x)
    return str(x)


def artifact_summary(a: dict[str, Any]) -> str:
    d, c = a.get("data") or {}, a.get("category")
    if c == "sms":
        who = d.get("contact_name") or d.get("address")
        verb = {"entrant": "reçu de", "sortant": "envoyé à"}.get(d.get("direction"), "échangé avec")
        return f"SMS {verb} {who} : « {d.get('body') or ''} »"
    if c == "appel":
        dur = f" ({d['duration_s']} s)" if d.get("duration_s") is not None else ""
        return f"Appel {DIRECTION_FR.get(d.get('direction'), '')} — {d.get('contact_name') or d.get('number')}{dur}".replace("  ", " ")
    if c == "contact":
        return f"{d.get('display_name')} — {_v(d.get('phone_numbers'))}"
    if c == "navigation":
        return f"{d.get('url')} ({d.get('browser') or 'navigateur ?'})"
    if c == "localisation":
        acc = f" ±{d['accuracy_m']:.0f} m" if d.get("accuracy_m") is not None else ""
        return f"{d.get('latitude')}, {d.get('longitude')}{acc}" + (f" ({d['provider']})" if d.get("provider") else "")
    if c == "exif":
        return f"{d.get('file_path')} — {d.get('make') or ''} {d.get('model') or ''}".strip()
    if c == "usage_app":
        return f"{d.get('package')} — {USAGE_FR.get(d.get('event'), d.get('event'))}"
    if c == "application":
        src = d.get("installer") or "installateur inconnu (sideload ?)"
        ver = f" v{d['version_name']}" if d.get("version_name") else ""
        return f"{d.get('package')}{ver} — {src}"
    if c == "wifi":
        return f"SSID « {d.get('ssid')} »" + (f" ({d['bssid']})" if d.get("bssid") else "")
    if c == "bluetooth":
        return f"{d.get('name') or 'sans nom'} [{d.get('mac')}]"
    if c == "compte":
        return f"{d.get('account_name')} ({d.get('account_type')})"
    if c == "ioc":
        return (f"IOC {IOC_TYPE_FR.get(d.get('ioc_type'), '')} « {d.get('ioc_value')} » — {d.get('ioc_source')}"
                + (f" ({d['malware_family']})" if d.get("malware_family") else ""))
    return ", ".join(f"{k}={v}" for k, v in list(d.items())[:4])
