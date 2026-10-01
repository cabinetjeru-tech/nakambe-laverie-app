"""Empreinte de FAIT : identité d'un fait indépendamment de l'outil qui l'a extrait.

Deux empreintes coexistent sur chaque artefact :

- `content_sha256` = SHA-256 de {category, data} : contenu exact tel que normalisé.
  Deux outils remplissent rarement les mêmes champs (ALEAPP fournit la date
  d'installation d'une application, MVT l'indicateur « système »…), donc cette empreinte
  diffère presque toujours d'un outil à l'autre.
- `fact_sha256` = SHA-256 des seuls attributs qui IDENTIFIENT le fait (clé ci-dessous).
  C'est elle qui sert au dédoublonnage (un même SMS lu par ALEAPP et Autopsy n'est compté
  qu'une fois) et à la corroboration (≥ 2 moteurs indépendants → « corroboré »).

La direction (entrant/sortant/manqué) n'entre PAS dans la clé des SMS et appels : les
outils la codent différemment (Autopsy classe un appel manqué « entrant », ALEAPP
« manqué ») ; l'horodatage à la seconde + le numéro (+ le texte) suffisent à identifier.

Règles de normalisation (volontairement conservatrices — en cas de doute, on NE fusionne
pas : une fausse corroboration est plus grave qu'un doublon) :
- horodatage tronqué à la seconde, en UTC ;
- numéros de téléphone : seuls le « + » initial et les chiffres sont conservés ;
- textes : espaces de début/fin retirés, casse conservée (sauf identifiants techniques
  insensibles à la casse : paquets, domaines, comptes, adresses MAC, SSID non).
"""
from __future__ import annotations

import re
from datetime import timezone
from typing import Any

from veritrace.core.hashing import sha256_json
from veritrace.core.timeutil import parse_iso


def norm_phone(value: Any) -> str:
    s = str(value or "").strip()
    plus = s.startswith("+")
    digits = re.sub(r"\D", "", s)
    return ("+" if plus else "") + digits


def norm_ts(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return parse_iso(value).astimezone(timezone.utc).replace(microsecond=0).isoformat()
    except ValueError:
        return value


def _s(value: Any) -> str:
    return str(value or "").strip()


def _low(value: Any) -> str:
    return _s(value).lower()


def fact_key(category: str, data: dict[str, Any], timestamp: str | None) -> dict[str, Any]:
    """Attributs identifiant un fait, par catégorie."""
    ts = norm_ts(timestamp)
    d = data or {}
    if category == "sms":
        return {"ts": ts, "addr": norm_phone(d.get("address")), "body": _s(d.get("body"))}
    if category == "appel":
        return {"ts": ts, "num": norm_phone(d.get("number"))}
    if category == "contact":
        nums = sorted({norm_phone(n) for n in d.get("phone_numbers") or [] if n})
        return {"name": _s(d.get("display_name")), "nums": nums}
    if category == "navigation":
        return {"ts": ts, "url": _s(d.get("url"))}
    if category == "localisation":
        lat, lon = d.get("latitude"), d.get("longitude")
        return {"ts": ts, "lat": round(float(lat), 5) if lat is not None else None,
                "lon": round(float(lon), 5) if lon is not None else None}
    if category == "exif":
        return {"file": d.get("file_sha256") or _s(d.get("file_path"))}
    if category == "usage_app":
        return {"ts": ts, "pkg": _low(d.get("package")), "event": d.get("event")}
    if category == "application":
        return {"pkg": _low(d.get("package"))}
    if category == "wifi":
        return {"ssid": _s(d.get("ssid"))}
    if category == "bluetooth":
        return {"mac": _s(d.get("mac")).upper()}
    if category == "compte":
        return {"type": _low(d.get("account_type")), "name": _low(d.get("account_name"))}
    if category == "ioc":
        return {"type": d.get("ioc_type"), "ioc": _low(d.get("ioc_value")), "value": _low(d.get("matched_value"))}
    return {"ts": ts, "data": d}


def fact_hash(category: str, data: dict[str, Any], timestamp: str | None) -> str:
    return sha256_json({"category": category, "key": fact_key(category, data, timestamp)})
