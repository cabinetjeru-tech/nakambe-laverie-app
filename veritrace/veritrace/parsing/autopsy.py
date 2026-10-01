"""Wrapper Autopsy — intégration du résultat d'ingest via sa sortie exportée.

Autopsy est une application graphique : Veritrace ne le lance pas. Il lit la **base de
cas** produite par l'ingest (`autopsy.db`, schéma Sleuth Kit — présente dans un dossier
de cas mono-utilisateur et dans un « Portable Case » exporté), en lecture seule.

Seuls les artefacts du **module Android** sont retenus par défaut : attributs dont la
colonne `source` contient « Android » (Android Analyzer) ou « aLEAPP ». Les autres
modules (Recent Activity, Picture Analyzer…) peuvent être ajoutés via `modules=`.

Moteur : les artefacts produits par le module « Android Analyzer (aLEAPP) » d'Autopsy
proviennent en réalité d'ALEAPP ; ils portent `engine = "ALEAPP"` et ne corroborent donc
pas les résultats d'ALEAPP lui-même. Le dédoublonnage avec ALEAPP se fait par empreinte
de fait (`fact_sha256`) lors de la corrélation : un même fait n'est compté qu'une fois.

Testé sur une base synthétique conforme au schéma Sleuth Kit (tests/fixtures/autopsy_case.py) ;
non testé sur une base produite par une installation réelle d'Autopsy.
"""
from __future__ import annotations

import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

from veritrace.core.logging_setup import get_logger
from veritrace.core.timeutil import parse_iso, utc_now_iso
from veritrace.parsing.base import ArtifactBuilder, RunContext, ToolFailed, ToolWrapper, WrapperResult
from veritrace.parsing.util import clean, to_float, to_iso

log = get_logger("parsing.autopsy")

DEFAULT_MODULES = ("android", "aleapp")
Attrs = dict[str, Any]


def find_case_db(path: Path) -> Path:
    if path.is_file() and path.suffix == ".db":
        return path
    if path.is_file() and path.suffix == ".aut":
        path = path.parent
    if path.is_dir():
        direct = path / "autopsy.db"
        if direct.is_file():
            return direct
        found = sorted(path.rglob("autopsy.db"))
        if found:
            return found[0]
    raise ToolFailed(f"aucune base de cas Autopsy (autopsy.db) trouvée dans {path}")


def _value(row: sqlite3.Row) -> Any:
    vt = row["value_type"]
    if vt == 0 or vt == 6:
        return row["value_text"]
    if vt == 1:
        return row["value_int32"]
    if vt == 2:
        return row["value_int64"]
    if vt == 3:
        return row["value_double"]
    if vt == 5:
        return to_iso(row["value_int64"])
    return None


def _dir(v: Any) -> str:
    v = (clean(v) or "").lower()
    return "entrant" if v.startswith("in") else "sortant" if v.startswith("out") else "inconnu"


# --------------------------------------------------------------------------- correspondances
def m_message(a: Attrs, emit) -> None:
    mtype = (clean(a.get("TSK_MESSAGE_TYPE")) or "SMS").lower()
    direction = _dir(a.get("TSK_DIRECTION"))
    addr = clean(a.get("TSK_PHONE_NUMBER_FROM") if direction == "entrant" else a.get("TSK_PHONE_NUMBER_TO")) \
        or clean(a.get("TSK_PHONE_NUMBER")) or clean(a.get("TSK_PHONE_NUMBER_FROM")) or ""
    ts = a.get("TSK_DATETIME") or a.get("TSK_DATETIME_RCVD") or a.get("TSK_DATETIME_SENT")
    if "sms" in mtype or "mms" in mtype:
        rs = a.get("TSK_READ_STATUS")
        emit("sms", ts, {"direction": direction, "address": addr, "body": clean(a.get("TSK_TEXT")),
                         "service": "mms" if "mms" in mtype else "sms", "read": None if rs is None else bool(rs)})
    else:  # messageries tierces : conservées hors catégorie SMS
        emit("autre", ts, {"autopsy_type": "TSK_MESSAGE", "message_type": mtype, "direction": direction,
                           "address": addr, "text": clean(a.get("TSK_TEXT"))})


def m_call(a: Attrs, emit) -> None:
    direction = _dir(a.get("TSK_DIRECTION"))
    num = clean(a.get("TSK_PHONE_NUMBER_FROM") if direction == "entrant" else a.get("TSK_PHONE_NUMBER_TO")) \
        or clean(a.get("TSK_PHONE_NUMBER"))
    if not num:
        return
    start, end = a.get("TSK_DATETIME_START"), a.get("TSK_DATETIME_END")
    dur = None
    if start and end:
        dur = max(0, int((parse_iso(end) - parse_iso(start)).total_seconds()))
    emit("appel", start, {"direction": direction, "number": num, "duration_s": dur})


def m_contact(a: Attrs, emit) -> None:
    name = clean(a.get("TSK_NAME"))
    if not name:
        return
    phones = sorted({clean(v) for k, v in a.items() if k.startswith("TSK_PHONE_NUMBER") and clean(v)})
    emails = sorted({clean(v) for k, v in a.items() if k.startswith("TSK_EMAIL") and clean(v)})
    emit("contact", None, {"display_name": name, "phone_numbers": phones, "emails": emails})


def m_web(a: Attrs, emit) -> None:
    url = clean(a.get("TSK_URL"))
    if url:
        emit("navigation", a.get("TSK_DATETIME_ACCESSED") or a.get("TSK_DATETIME"),
             {"url": url, "title": clean(a.get("TSK_TITLE")), "browser": clean(a.get("TSK_PROG_NAME"))})


def m_gps(a: Attrs, emit) -> None:
    lat, lon = to_float(a.get("TSK_GEO_LATITUDE")), to_float(a.get("TSK_GEO_LONGITUDE"))
    if lat is None or lon is None:
        return
    emit("localisation", a.get("TSK_DATETIME"), {"latitude": lat, "longitude": lon,
                                             "altitude_m": to_float(a.get("TSK_GEO_ALTITUDE")),
                                             "source_app": clean(a.get("TSK_PROG_NAME"))})


def m_installed(a: Attrs, emit) -> None:
    pkg = clean(a.get("TSK_PROG_NAME"))
    if pkg:
        ts = a.get("TSK_DATETIME")
        emit("application", ts, {"package": pkg, "first_install": ts})


def m_wifi(a: Attrs, emit) -> None:
    ssid = clean(a.get("TSK_SSID"))
    if ssid:
        bssid = clean(a.get("TSK_MAC_ADDRESS")) or clean(a.get("TSK_DEVICE_ID"))
        emit("wifi", a.get("TSK_DATETIME"), {"ssid": ssid.strip('"'), "bssid": bssid.lower() if bssid else None,
                                             "last_connected": a.get("TSK_DATETIME")})


def m_bluetooth(a: Attrs, emit) -> None:
    mac = clean(a.get("TSK_MAC_ADDRESS")) or clean(a.get("TSK_DEVICE_ID"))
    if mac and len(mac) == 17:
        emit("bluetooth", a.get("TSK_DATETIME"), {"mac": mac.upper(), "name": clean(a.get("TSK_DEVICE_NAME")),
                                                  "paired": True})


def m_account(a: Attrs, emit) -> None:
    name = clean(a.get("TSK_USER_ID")) or clean(a.get("TSK_USER_NAME")) or clean(a.get("TSK_EMAIL"))
    atype = clean(a.get("TSK_CATEGORY")) or clean(a.get("TSK_PROG_NAME"))
    if name and atype:
        emit("compte", None, {"account_type": atype, "account_name": name})


def m_exif(a: Attrs, emit, file_path: str | None = None) -> None:
    emit("exif", a.get("TSK_DATETIME_CREATED") or a.get("TSK_DATETIME"), {
        "file_path": file_path or "?", "make": clean(a.get("TSK_DEVICE_MAKE")), "model": clean(a.get("TSK_DEVICE_MODEL")),
        "latitude": to_float(a.get("TSK_GEO_LATITUDE")), "longitude": to_float(a.get("TSK_GEO_LONGITUDE"))})


def m_prog_run(a: Attrs, emit) -> None:
    pkg = clean(a.get("TSK_PROG_NAME"))
    if pkg:
        emit("usage_app", a.get("TSK_DATETIME"), {"package": pkg, "event": "lancement"})


MAPPERS: dict[str, Callable] = {
    "TSK_MESSAGE": m_message, "TSK_CALLLOG": m_call, "TSK_CONTACT": m_contact, "TSK_WEB_HISTORY": m_web,
    "TSK_GPS_TRACKPOINT": m_gps, "TSK_GPS_LAST_KNOWN_LOCATION": m_gps, "TSK_GPS_BOOKMARK": m_gps,
    "TSK_INSTALLED_PROG": m_installed, "TSK_WIFI_NETWORK": m_wifi, "TSK_BLUETOOTH_PAIRING": m_bluetooth,
    "TSK_SERVICE_ACCOUNT": m_account, "TSK_PROG_RUN": m_prog_run,
}


def normalize(db: Path, builder: ArtifactBuilder, version: str | None,
              modules: tuple[str, ...] = DEFAULT_MODULES) -> list[str]:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        try:
            schema = con.execute("SELECT schema_ver, schema_minor_ver FROM tsk_db_info").fetchone()
        except sqlite3.Error:
            schema = None
        files = {r["obj_id"]: f"{r['parent_path'] or ''}{r['name'] or ''}"
                 for r in con.execute("SELECT obj_id, name, parent_path FROM tsk_files")}
        arts = {r["artifact_id"]: (r["type_name"], r["obj_id"]) for r in con.execute(
            "SELECT a.artifact_id, t.type_name, a.obj_id FROM blackboard_artifacts a "
            "JOIN blackboard_artifact_types t ON t.artifact_type_id = a.artifact_type_id")}
        attrs: dict[int, Attrs] = defaultdict(dict)
        sources: dict[int, set[str]] = defaultdict(set)
        for r in con.execute(
                "SELECT b.artifact_id, t.type_name, b.value_type, b.value_text, b.value_int32, b.value_int64, "
                "b.value_double, b.source FROM blackboard_attributes b "
                "JOIN blackboard_attribute_types t ON t.attribute_type_id = b.attribute_type_id"):
            attrs[r["artifact_id"]][r["type_name"]] = _value(r)
            if r["source"]:
                sources[r["artifact_id"]].add(r["source"])
    except sqlite3.Error as exc:
        raise ToolFailed(f"base Autopsy illisible ({exc}) — schéma Sleuth Kit attendu") from exc
    finally:
        con.close()

    wanted = tuple(m.lower() for m in modules)
    kept = excluded = unmapped = 0
    excluded_modules: set[str] = set()
    for aid, (atype, obj_id) in sorted(arts.items()):
        srcs = sources.get(aid, set())
        if not any(w in s.lower() for s in srcs for w in wanted):
            excluded += 1
            excluded_modules.update(srcs or {"(module inconnu)"})
            continue
        mapper = MAPPERS.get(atype) if atype != "TSK_METADATA_EXIF" else None
        if mapper is None and atype != "TSK_METADATA_EXIF":
            unmapped += 1
            continue
        engine = "ALEAPP" if any("aleapp" in s.lower() for s in srcs) else "Autopsy"
        tool = {"name": "Autopsy", "version": version, "engine": engine}
        fpath = files.get(obj_id)
        module = ", ".join(sorted(srcs))

        def emit(category, ts, data, _tool=tool, _fp=fpath, _aid=aid, _atype=atype, _mod=module):
            return builder.add(category=category, timestamp=ts, tool=_tool, data=data, file_path=_fp,
                               record_ref=f"Autopsy artifact_id={_aid} ({_atype}, module {_mod})")

        try:
            if atype == "TSK_METADATA_EXIF":
                m_exif(attrs[aid], emit, fpath)
            else:
                mapper(attrs[aid], emit)
            kept += 1
        except Exception as exc:
            log.warning("Autopsy artifact_id=%s (%s) ignoré : %s", aid, atype, exc)

    notes = [f"Base de cas : {db.name}" + (f" (schéma Sleuth Kit {schema[0]}.{schema[1]})" if schema else "") + "."]
    notes.append(f"{kept} artefact(s) du module Android retenu(s)")
    if excluded:
        notes[-1] += f", {excluded} hors périmètre ignoré(s) (modules : {', '.join(sorted(excluded_modules))})"
    if unmapped:
        notes[-1] += f", {unmapped} de type non normalisé"
    notes[-1] += "."
    return notes


class AutopsyWrapper(ToolWrapper):
    key = "autopsy"
    name = "autopsy"

    def run(self, extraction: Path, out_dir: Path, ctx: RunContext) -> WrapperResult:
        """`extraction` = dossier de cas Autopsy, Portable Case, fichier .aut ou autopsy.db."""
        started = utc_now_iso()
        source = Path(ctx.options.get("from_output") or extraction)
        db = find_case_db(source)
        version = ctx.options.get("version")
        builder = ArtifactBuilder(ctx.run_id, ctx.item_id)
        notes = normalize(db, builder, version, tuple(ctx.options.get("modules") or DEFAULT_MODULES))
        if builder.internal_duplicates:
            notes.append(f"{builder.internal_duplicates} doublon(s) interne(s) fusionné(s).")
        if not version:
            notes.append("Version d'Autopsy non déclarée (utiliser --autopsy-version).")
        return WrapperResult(tool={"name": "Autopsy", "version": version}, mode="importe", command=[],
                             started_at=started, ended_at=utc_now_iso(), output_path=db,
                             artifacts=builder.items, notes=notes)
