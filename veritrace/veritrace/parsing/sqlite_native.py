"""Parseurs natifs Veritrace (moteur `veritrace-sqlite`), indépendants d'ALEAPP.

Aucun outil externe n'est nécessaire : ce moteur est toujours disponible. Il apporte une
seconde lecture des bases Android (corroboration avec ALEAPP / Autopsy) et des sources
qu'ALEAPP ne normalise pas encore dans Veritrace.

| Source | Données |
|---|---|
| `com.android.providers.telephony/…/mmssms.db` | SMS, MMS |
| `…/calllog.db` (ou table `calls` de contacts2.db, Android ancien) | appels |
| `com.android.providers.contacts/…/contacts2.db` | contacts |
| `History` (Chrome, Samsung Internet, Opera, WebView) | navigation |
| photos JPEG (DCIM, Pictures, Download…) | EXIF + localisation GPS (heure UTC du GPS) |
| `dumpsys package` (fichier `dumpsys_package*.txt` ou section de `dumpsys.txt`) | applications, installateur, statut système, permissions accordées |
| `dumpsys accessibility` | services d'accessibilité ACTIVÉS |
| WhatsApp / WhatsApp Business `msgstore.db` + `wa.db` (schémas moderne et historique) | messages, appels, contacts |
| Viber `viber_messages` / `viber_data` | messages, appels, contacts |
| Facebook Messenger `threads_db2` | messages |
| Signal `signal.db`, sauvegardes WhatsApp `.cryptNN` | détectés et consignés comme NON analysés (chiffrés) |

Entrées acceptées : dossier, archive `.tar` / `.tar.gz` / `.zip` — y compris le tar issu
d'une sauvegarde ADB (`apps/<paquet>/db/…`). Les fichiers sont reconnus par leur nom et le
paquet Android présent dans leur chemin.

Non-altération : chaque base est copiée (avec ses fichiers `-wal` / `-journal`) dans
`parsed/veritrace-sqlite/<RUN-ID>/work/` et ouverte sur cette copie de travail ; le
journal WAL y est rejoué, ce qui inclut les écritures non encore consolidées. Les
originaux ne sont jamais ouverts en écriture. Les enregistrements supprimés (pages
libres) ne sont pas récupérés.
"""
from __future__ import annotations

import json
import re
import shutil
import sqlite3
import tarfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterator

from veritrace import __version__
from veritrace.core.hashing import sha256_file
from veritrace.core.logging_setup import get_logger
from veritrace.core.timeutil import utc_now_iso
from veritrace.parsing.aleapp import is_system_path
from veritrace.parsing.base import ArtifactBuilder, RunContext, ToolFailed, ToolWrapper, WrapperResult
from veritrace.parsing.util import clean, to_iso

log = get_logger("parsing.sqlite")

ENGINE = "veritrace-sqlite"
TOOL = {"name": ENGINE, "version": __version__}
IMAGE_DIRS = {"DCIM", "Pictures", "Download", "WhatsApp Images", "Camera", "Screenshots"}
BROWSERS = {"app_chrome": "Chrome", "app_sbrowser": "Samsung Internet", "app_opera": "Opera", "app_webview": "WebView"}
SIDECARS = ("-wal", "-journal", "-shm")
WHATSAPP_PACKAGES = {"com.whatsapp": "WhatsApp", "com.whatsapp.w4b": "WhatsApp Business"}
SQLITE_MAGIC = b"SQLite format 3\x00"


# --------------------------------------------------------------------------- reconnaissance des fichiers
def classify(rel: str) -> str | None:
    """Type de source d'après le chemin relatif (POSIX) ; None si non pris en charge."""
    p = PurePosixPath(rel)
    parts, name = set(p.parts), p.name
    if name == "mmssms.db" and "com.android.providers.telephony" in parts:
        return "sms"
    if name == "calllog.db":
        return "calllog"
    if name in ("contacts2.db", "contacts.db") and any("providers.contacts" in x for x in parts):
        return "contacts"
    if name == "History" and parts & set(BROWSERS):
        return "browser"
    if name.lower().endswith((".jpg", ".jpeg")) and parts & IMAGE_DIRS:
        return "image"
    if re.fullmatch(r"dumpsys_package.*\.txt", name):
        return "dumpsys_package"
    if re.fullmatch(r"dumpsys_accessibility.*\.txt", name):
        return "dumpsys_accessibility"
    if name == "dumpsys.txt":
        return "dumpsys_all"
    if parts & set(WHATSAPP_PACKAGES):
        if name == "msgstore.db":
            return "whatsapp"
        if name == "wa.db":
            return "whatsapp_contacts"
    if re.fullmatch(r"msgstore.*\.db\.crypt\d+", name):
        return "whatsapp_crypt"
    if "com.viber.voip" in parts and name in ("viber_messages", "viber_data"):
        return name
    if name == "threads_db2" and "com.facebook.orca" in parts:
        return "messenger"
    if name == "signal.db" and "org.thoughtcrime.securesms" in parts:
        return "signal"
    return None


@dataclass
class Source:
    kind: str
    rel: str          # chemin dans l'extraction (traçabilité)
    path: Path        # fichier lisible (original pour un dossier, copie extraite pour une archive)


def _iter_dir(root: Path) -> Iterator[tuple[str, Path]]:
    for f in sorted(root.rglob("*")):
        if f.is_file() and not f.is_symlink():
            yield f.relative_to(root).as_posix(), f


def collect_sources(extraction: Path, work: Path) -> list[Source]:
    """Repère les sources ; extrait de l'archive uniquement les fichiers utiles (et leurs annexes)."""
    out: list[Source] = []
    if extraction.is_dir():
        for rel, f in _iter_dir(extraction):
            kind = classify(rel)
            if kind:
                out.append(Source(kind, rel, f))
        return out
    if extraction.is_file() and extraction.name == "dumpsys.txt" or classify(extraction.name) in (
            "dumpsys_package", "dumpsys_accessibility", "dumpsys_all"):
        return [Source(classify(extraction.name), extraction.name, extraction)]

    extract_dir = work / "extrait"
    if tarfile.is_tarfile(extraction):
        with tarfile.open(extraction) as tf:
            members = {m.name.lstrip("./"): m for m in tf.getmembers() if m.isfile()}
            wanted = {n for n in members if classify(n)}
            wanted |= {n + s for n in wanted for s in SIDECARS if n + s in members}
            for n in sorted(wanted):
                dest = extract_dir / n
                dest.parent.mkdir(parents=True, exist_ok=True)
                with tf.extractfile(members[n]) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
    elif zipfile.is_zipfile(extraction):
        with zipfile.ZipFile(extraction) as zf:
            names = {n for n in zf.namelist() if not n.endswith("/")}
            wanted = {n for n in names if classify(n)}
            wanted |= {n + s for n in wanted for s in SIDECARS if n + s in names}
            for n in sorted(wanted):
                dest = extract_dir / n
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(n) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
    else:
        raise ToolFailed(f"format d'entrée non pris en charge : {extraction.name} (dossier, .tar, .tar.gz ou .zip)")
    for rel, f in _iter_dir(extract_dir) if extract_dir.exists() else []:
        kind = classify(rel)
        if kind:
            out.append(Source(kind, rel, f))
    return out


def open_copy(src: Path, work: Path, index: int) -> tuple[sqlite3.Connection, bool]:
    """Copie la base (+ annexes) dans `work` et l'ouvre ; renvoie (connexion, WAL présent)."""
    dest_dir = work / "db" / str(index)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    shutil.copy2(src, dest)
    wal = False
    for s in SIDECARS[:2]:
        side = src.with_name(src.name + s)
        if side.is_file():
            shutil.copy2(side, dest.with_name(dest.name + s))
            wal = wal or s == "-wal"
    for f in [dest, *dest_dir.glob(dest.name + "-*")]:
        f.chmod(0o644)  # la copie de travail doit être inscriptible pour rejouer le WAL
    con = sqlite3.connect(dest)
    con.row_factory = sqlite3.Row
    return con, wal


def _tables(con: sqlite3.Connection) -> set[str]:
    return {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _cols(con: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}


def _ms(v: Any) -> str | None:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return to_iso(n / 1000) if n > 0 else None


def _webkit(v: Any) -> str | None:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return (datetime(1601, 1, 1, tzinfo=timezone.utc) + timedelta(microseconds=n)).replace(microsecond=0).isoformat()


# --------------------------------------------------------------------------- bases SQLite
SMS_DIRECTION = {1: "entrant", 2: "sortant", 4: "sortant", 5: "sortant", 6: "sortant"}
CALL_DIRECTION = {1: "entrant", 2: "sortant", 3: "manque", 4: "entrant", 5: "rejete", 6: "bloque", 7: "entrant"}


def parse_sms(con: sqlite3.Connection, src: Source, emit) -> int:
    n = 0
    tables = _tables(con)
    if "sms" in tables:
        for r in con.execute("SELECT * FROM sms ORDER BY _id"):
            if not r["address"] and not r["body"]:
                continue
            emit("sms", _ms(r["date"]), {
                "direction": SMS_DIRECTION.get(r["type"], "inconnu"), "address": clean(r["address"]) or "",
                "body": r["body"], "service": "sms", "read": None if r["read"] is None else bool(r["read"]),
                "thread_id": None if r["thread_id"] is None else str(r["thread_id"])},
                src, f"sms:_id={r['_id']}")
            n += 1
    if {"pdu", "addr", "part"} <= tables:  # MMS : date en secondes ; adresse FROM 0x89 / TO 0x97
        for r in con.execute("SELECT _id, thread_id, date, msg_box, read FROM pdu ORDER BY _id"):
            box = r["msg_box"]
            addr_type = 0x89 if box == 1 else 0x97
            addr = con.execute("SELECT address FROM addr WHERE msg_id=? AND type=?", (r["_id"], addr_type)).fetchone()
            text = " ".join(t[0] for t in con.execute(
                "SELECT text FROM part WHERE mid=? AND ct='text/plain' AND text IS NOT NULL ORDER BY seq", (r["_id"],)))
            emit("sms", to_iso(r["date"]), {
                "direction": "entrant" if box == 1 else "sortant" if box in (2, 4) else "inconnu",
                "address": clean(addr[0]) if addr else "", "body": text or None, "service": "mms",
                "read": None if r["read"] is None else bool(r["read"]),
                "thread_id": None if r["thread_id"] is None else str(r["thread_id"])},
                src, f"pdu:_id={r['_id']}")
            n += 1
    return n


def parse_calls(con: sqlite3.Connection, src: Source, emit) -> int:
    if "calls" not in _tables(con):
        return 0
    cols = _cols(con, "calls")
    n = 0
    for r in con.execute("SELECT * FROM calls ORDER BY _id"):
        if not r["number"]:
            continue
        emit("appel", _ms(r["date"]), {
            "direction": CALL_DIRECTION.get(r["type"], "inconnu"), "number": r["number"],
            "contact_name": clean(r["name"]) if "name" in cols else None,
            "duration_s": int(r["duration"]) if r["duration"] is not None else None},
            src, f"calls:_id={r['_id']}")
        n += 1
    return n


def parse_contacts(con: sqlite3.Connection, src: Source, emit) -> int:
    tables = _tables(con)
    n = 0
    if {"raw_contacts", "data", "mimetypes"} <= tables:
        deleted = "AND raw_contacts.deleted = 0" if "deleted" in _cols(con, "raw_contacts") else ""
        people: dict[str, dict[str, set]] = {}
        for r in con.execute(f"""
                SELECT raw_contacts.display_name AS name, mimetypes.mimetype AS mt, data.data1 AS v
                  FROM raw_contacts JOIN data ON data.raw_contact_id = raw_contacts._id
                  JOIN mimetypes ON mimetypes._id = data.mimetype_id
                 WHERE mimetypes.mimetype IN ('vnd.android.cursor.item/phone_v2', 'vnd.android.cursor.item/email_v2')
                   {deleted}"""):
            name = clean(r["name"])
            if not name or not r["v"]:
                continue
            p = people.setdefault(name, {"phones": set(), "emails": set()})
            (p["phones"] if r["mt"].endswith("phone_v2") else p["emails"]).add(r["v"].strip())
        for name, p in sorted(people.items()):
            emit("contact", None, {"display_name": name, "phone_numbers": sorted(p["phones"]),
                                   "emails": sorted(p["emails"])}, src, f"raw_contacts:display_name={name}")
            n += 1
    n += parse_calls(con, src, emit)  # Android ancien : journal d'appels dans contacts2.db
    return n


def parse_browser(con: sqlite3.Connection, src: Source, emit) -> int:
    if "urls" not in _tables(con):
        return 0
    browser = next((b for k, b in BROWSERS.items() if k in PurePosixPath(src.rel).parts), None)
    n = 0
    for r in con.execute("SELECT id, url, title, visit_count, last_visit_time FROM urls ORDER BY id"):
        if not r["url"]:
            continue
        emit("navigation", _webkit(r["last_visit_time"]), {
            "url": r["url"], "title": clean(r["title"]), "browser": browser,
            "visit_count": r["visit_count"]}, src, f"urls:id={r['id']}")
        n += 1
    return n


# --------------------------------------------------------------------------- messageries tierces
WA_TYPES = {0: "texte", 1: "image", 2: "audio", 3: "video", 5: "localisation", 7: "systeme", 9: "document",
            13: "image", 16: "localisation", 20: "image"}


def _wa_number(raw: str | None) -> str | None:
    if not raw or "@" not in raw:
        return None
    user = raw.split("@", 1)[0].split(":", 1)[0]
    return f"+{user}" if user.isdigit() and raw.endswith("@s.whatsapp.net") else user


def _wa_contact_name(r: sqlite3.Row) -> str:
    """Même règle que l'application (et ALEAPP) : prénom + nom, sinon nom affiché, sinon JID."""
    given, family, display = r["given_name"], r["family_name"], r["display_name"]
    if given and family:
        return f"{given} {family}"
    return given or family or display or r["jid"]


def _wa_app(src: Source) -> str:
    return next((label for pkg, label in WHATSAPP_PACKAGES.items() if pkg in PurePosixPath(src.rel).parts),
                "WhatsApp")


def parse_whatsapp_contacts(con: sqlite3.Connection, src: Source, emit) -> tuple[int, dict[str, str]]:
    """wa.db : contacts WhatsApp ; renvoie aussi l'index JID → nom affiché (pour msgstore.db)."""
    names: dict[str, str] = {}
    if "wa_contacts" not in _tables(con):
        return 0, names
    cols = _cols(con, "wa_contacts")
    n = 0
    for r in con.execute("SELECT * FROM wa_contacts"):
        jid = r["jid"] or ""
        if jid.endswith("@newsletter") or jid == "status@broadcast":
            continue
        name = _wa_contact_name(r)
        names[jid] = (r["wa_name"] if "wa_name" in cols and r["wa_name"] else None) or name
        if name and r["number"]:
            emit("contact", None, {"display_name": name, "phone_numbers": [r["number"]], "emails": [],
                                   "app": _wa_app(src)}, src, f"wa_contacts:jid={jid}")
            n += 1
    return n, names


def parse_whatsapp(con: sqlite3.Connection, src: Source, emit, names: dict[str, str]) -> int:
    app = _wa_app(src)
    tables = _tables(con)
    n = 0
    if {"message", "chat", "jid"} <= tables:                       # schéma moderne (2022+)
        jids = {r["_id"]: r["raw_string"] for r in con.execute("SELECT _id, raw_string FROM jid")}
        chats = {r["_id"]: (jids.get(r["jid_row_id"]), r["subject"])
                 for r in con.execute("SELECT _id, jid_row_id, subject FROM chat")}
        media = {r["message_row_id"]: r["file_path"] for r in con.execute(
            "SELECT message_row_id, file_path FROM message_media")} if "message_media" in tables else {}
        locs = {r["message_row_id"]: (r["latitude"], r["longitude"]) for r in con.execute(
            "SELECT message_row_id, latitude, longitude FROM message_location")} if "message_location" in tables else {}
        for r in con.execute("SELECT * FROM message ORDER BY _id"):
            chat_jid, subject = chats.get(r["chat_row_id"], (None, None))
            if not chat_jid or chat_jid.endswith("@newsletter"):
                continue                                           # chaînes publiques : hors conversations
            group = chat_jid.endswith("@g.us")
            incoming = r["from_me"] == 0
            sender = (jids.get(r["sender_jid_row_id"]) if group else chat_jid) if incoming else None
            lat, lon = locs.get(r["_id"], (None, None))
            emit("message", _ms(r["timestamp"]), {
                "app": app, "direction": "entrant" if incoming else "sortant",
                "conversation": subject if group else (names.get(chat_jid) or chat_jid), "is_group": group,
                "sender": sender, "sender_name": names.get(sender) if sender else None,
                "body": r["text_data"].strip() if r["text_data"] and r["text_data"].strip() else None,
                "message_type": WA_TYPES.get(r["message_type"], "autre"), "attachment": media.get(r["_id"]),
                "latitude": lat, "longitude": lon}, src, f"message:_id={r['_id']}")
            n += 1
        if "call_log" in tables:
            for r in con.execute("SELECT * FROM call_log ORDER BY _id"):
                raw = jids.get(r["jid_row_id"])
                emit("appel", _ms(r["timestamp"]), {
                    "app": app, "direction": "entrant" if r["from_me"] == 0 else "sortant",
                    "number": _wa_number(raw) or "", "contact_name": names.get(raw),
                    "duration_s": r["duration"], "call_type": "video" if r["video_call"] else "audio"},
                    src, f"call_log:_id={r['_id']}")
                n += 1
    elif "messages" in tables:                                     # schéma historique
        cols = _cols(con, "messages")
        for r in con.execute("SELECT * FROM messages ORDER BY _id"):
            remote = r["key_remote_jid"] or ""
            if remote in ("-1", "") or remote.endswith("@newsletter"):
                continue
            group = remote.endswith("@g.us")
            incoming = r["key_from_me"] == 0
            sender = (r["remote_resource"] if group and "remote_resource" in cols else remote) if incoming else None
            emit("message", _ms(r["timestamp"]), {
                "app": app, "direction": "entrant" if incoming else "sortant",
                "conversation": names.get(remote) or remote, "is_group": group, "sender": sender or None,
                "sender_name": names.get(sender) if sender else None,
                "body": r["data"].strip() if r["data"] and str(r["data"]).strip() else None,
                "message_type": "texte" if r["data"] else "autre",
                "attachment": (r["media_name"] if "media_name" in cols else None) or None,
                "latitude": (r["latitude"] or None) if "latitude" in cols else None,
                "longitude": (r["longitude"] or None) if "longitude" in cols else None}, src, f"messages:_id={r['_id']}")
            n += 1
    return n


def parse_viber_messages(con: sqlite3.Connection, src: Source, emit) -> int:
    tables = _tables(con)
    if not {"messages", "participants", "participants_info"} <= tables:
        return 0
    numbers = {r["pid"]: r["number"] for r in con.execute(
        "SELECT p._id AS pid, i.number AS number FROM participants p JOIN participants_info i ON i._id = p.participant_info_id")}
    n = 0
    for r in con.execute("SELECT * FROM messages ORDER BY _id"):
        incoming = r["send_type"] == 0
        emit("message", _ms(r["msg_date"]), {
            "app": "Viber", "direction": "entrant" if incoming else "sortant" if r["send_type"] == 1 else "inconnu",
            "conversation": str(r["conversation_id"]), "is_group": None,
            "sender": numbers.get(r["participant_id"]) if incoming else None,
            "body": r["body"].strip() if r["body"] and r["body"].strip() else None,
            "message_type": "texte" if r["body"] else "autre", "attachment": r["extra_uri"] or None,
            "read": None if r["unread"] is None else not bool(r["unread"])}, src, f"messages:_id={r['_id']}")
        n += 1
    return n


def parse_viber_data(con: sqlite3.Connection, src: Source, emit) -> int:
    tables = _tables(con)
    n = 0
    if "calls" in tables:
        for r in con.execute("SELECT * FROM calls ORDER BY _id"):
            emit("appel", _ms(r["date"]), {
                "app": "Viber", "direction": {1: "entrant", 2: "sortant"}.get(r["type"], "inconnu"),
                "number": r["canonized_number"] or "", "duration_s": r["duration"],
                "call_type": {1: "audio", 4: "video"}.get(r["viber_call_type"])}, src, f"calls:_id={r['_id']}")
            n += 1
    if {"phonebookcontact", "phonebookdata"} <= tables:
        for r in con.execute("""SELECT c._id AS cid, c.display_name AS name, coalesce(d.data2, d.data1, d.data3) AS num
                                  FROM phonebookcontact c JOIN phonebookdata d ON c._id = d.contact_id"""):
            if r["name"] and r["num"]:
                emit("contact", None, {"display_name": r["name"], "phone_numbers": [r["num"]], "emails": [],
                                       "app": "Viber"}, src, f"phonebookcontact:_id={r['cid']}")
                n += 1
    return n


def parse_messenger(con: sqlite3.Connection, src: Source, emit) -> int:
    if "messages" not in _tables(con):
        return 0
    cols = _cols(con, "messages")
    admin = "AND generic_admin_message_extensible_data IS NULL" if "generic_admin_message_extensible_data" in cols else ""
    n = 0
    for r in con.execute(f"SELECT * FROM messages WHERE coalesce(msg_type, 0) != -1 {admin} ORDER BY timestamp_ms"):
        try:
            sender = json.loads(r["sender"] or "{}")
        except ValueError:
            sender = {}
        try:
            att = json.loads(r["attachments"] or "[]") if "attachments" in cols else []
        except ValueError:
            att = []
        user_key = str(sender.get("user_key") or "")
        emit("message", _ms(r["timestamp_ms"]), {
            "app": "Facebook Messenger", "direction": "inconnu", "conversation": r["thread_key"], "is_group": None,
            "sender": user_key.split(":", 1)[-1] or None, "sender_name": sender.get("name"),
            "body": r["text"].strip() if r["text"] and r["text"].strip() else None,
            "message_type": "texte" if r["text"] else "autre",
            "attachment": (att[0] or {}).get("filename") if att and isinstance(att[0], dict) else None},
            src, f"msg_id={r['msg_id']}")
        n += 1
    return n


DB_PARSERS = {"sms": parse_sms, "calllog": parse_calls, "contacts": parse_contacts, "browser": parse_browser,
              "viber_messages": parse_viber_messages, "viber_data": parse_viber_data, "messenger": parse_messenger}


# --------------------------------------------------------------------------- EXIF
def _dms(values: Any, ref: Any) -> float | None:
    try:
        d, m, s = (float(x) for x in values)
    except (TypeError, ValueError):
        return None
    v = d + m / 60 + s / 3600
    return round(-v if str(ref).upper() in ("S", "W") else v, 6)


def parse_image(src: Source, emit) -> int:
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:
        raise ToolFailed("Pillow absent : EXIF non analysé")  # signalé, non bloquant (voir run)
    try:
        with Image.open(src.path) as img:
            exif = img.getexif()
            sub, gps = exif.get_ifd(0x8769), exif.get_ifd(0x8825)
    except (UnidentifiedImageError, OSError):
        return 0
    if not exif and not sub and not gps:
        return 0
    dto, offset = sub.get(36867) or exif.get(306), sub.get(36881)
    ts = None
    if dto and offset:
        try:
            ts = to_iso(datetime.strptime(f"{dto}{offset}", "%Y:%m:%d %H:%M:%S%z").isoformat())
        except ValueError:
            ts = None
    lat, lon = _dms(gps.get(2), gps.get(1)), _dms(gps.get(4), gps.get(3))
    gps_ts = None
    if gps.get(29) and gps.get(7):
        try:
            h, m, s = (float(x) for x in gps[7])
            day = datetime.strptime(str(gps[29]), "%Y:%m:%d").replace(tzinfo=timezone.utc)
            gps_ts = (day + timedelta(hours=h, minutes=m, seconds=s)).replace(microsecond=0).isoformat()
        except (TypeError, ValueError):
            gps_ts = None
    file_sha = sha256_file(src.path)
    emit("exif", ts or gps_ts, {
        "file_path": src.rel, "file_sha256": file_sha, "make": clean(exif.get(271)), "model": clean(exif.get(272)),
        "datetime_original_local": clean(dto), "offset_time_original": clean(offset), "gps_timestamp": gps_ts,
        "latitude": lat, "longitude": lon}, src, "EXIF")
    n = 1
    if lat is not None and lon is not None:
        emit("localisation", gps_ts or ts, {"latitude": lat, "longitude": lon, "provider": "exif",
                                            "source_app": None}, src, "EXIF GPS")
        n += 1
    return n


# --------------------------------------------------------------------------- dumpsys
PKG_RE = re.compile(r"^\s{2}Package \[([^\]]+)\]")
KV_RE = re.compile(r"^\s+(codePath|versionName|firstInstallTime|installerPackageName|pkgFlags)=(.*)$")
PERM_RE = re.compile(r"^\s+([\w.]+\.permission\.[\w.]+|android\.permission\.[\w.]+): granted=(true|false)")


def dumpsys_section(text: str, service: str) -> str | None:
    """Section `DUMP OF SERVICE <service>:` d'un dumpsys global (AndroidQF, bugreport)."""
    m = re.search(rf"^DUMP OF SERVICE {re.escape(service)}:\s*$", text, re.M)
    if not m:
        return None
    end = re.search(r"^-{5,}|^DUMP OF SERVICE ", text[m.end():], re.M)
    return text[m.end(): m.end() + end.start()] if end else text[m.end():]


def parse_dumpsys_package(text: str) -> list[dict[str, Any]]:
    apps: list[dict[str, Any]] = []
    in_packages = False
    cur: dict[str, Any] | None = None
    for line in text.splitlines():
        if line.startswith("Packages:"):
            in_packages = True
            continue
        if in_packages and line and not line.startswith(" "):
            break  # fin de la section « Packages: » (« Hidden system packages: », etc.)
        if not in_packages:
            continue
        m = PKG_RE.match(line)
        if m:
            cur = {"package": m.group(1), "perms": set()}
            apps.append(cur)
            continue
        if cur is None:
            continue
        m = KV_RE.match(line)
        if m:
            cur[m.group(1)] = m.group(2).strip()
            continue
        m = PERM_RE.match(line)
        if m and m.group(2) == "true":
            cur["perms"].add(m.group(1))
    out = []
    for a in apps:
        flags = a.get("pkgFlags", "")
        installer = a.get("installerPackageName")
        out.append({
            "package": a["package"],
            "version_name": a.get("versionName"),
            "installer": None if installer in (None, "", "null") else installer,
            "is_system": True if re.search(r"\bSYSTEM\b", flags) else is_system_path(a.get("codePath")),
            "permissions": sorted(a["perms"]),
            "first_install_local": a.get("firstInstallTime"),
        })
    return out


def parse_dumpsys_accessibility(text: str) -> set[str]:
    pkgs: set[str] = set()
    for m in re.finditer(r"Enabled services:\{(.*)\}\s*$", text, re.M):
        pkgs |= set(re.findall(r"\{?([A-Za-z0-9_.]+)/", m.group(1)))
    return pkgs


def _unreadable_note(src: Source) -> str:
    """Base présente mais non analysable : consignée dans les limites de l'affaire (aucun déchiffrement tenté)."""
    with open(src.path, "rb") as fh:
        plain = fh.read(16) == SQLITE_MAGIC
    if src.kind == "signal":
        if plain:
            return (f"Signal : base {src.rel} présente et non chiffrée, non analysée par le moteur natif "
                    "(voir ALEAPP).")
        return (f"Signal : base de messages présente ({src.rel}) mais chiffrée (SQLCipher, clé protégée par le "
                "Keystore Android) ; contenu non analysé. Veritrace ne tente aucun déchiffrement.")
    return (f"WhatsApp : sauvegarde chiffrée présente ({src.rel}), non déchiffrée (la clé est stockée dans "
            "l'espace privé de l'application) ; son contenu n'est pas analysé.")


# --------------------------------------------------------------------------- wrapper
class SqliteNativeWrapper(ToolWrapper):
    key = "veritrace-sqlite"
    name = "veritrace-sqlite"

    def run(self, extraction: Path, out_dir: Path, ctx: RunContext) -> WrapperResult:
        started = utc_now_iso()
        work = out_dir / "work"
        work.mkdir(parents=True, exist_ok=True)
        sources = collect_sources(extraction, work)
        builder = ArtifactBuilder(ctx.run_id, ctx.item_id)

        def emit(category, ts, data, src: Source, ref: str):
            return builder.add(category=category, timestamp=ts, tool=TOOL, data=data, file_path=src.rel, record_ref=ref)

        counts: dict[str, int] = {}
        notes: list[str] = []
        wal_files = 0
        accessibility: set[str] | None = None
        dumpsys_apps: list[tuple[Source, dict]] = []
        limitations: list[str] = []
        wa_names: dict[str, dict[str, str]] = {}
        # wa.db d'abord : ses noms servent à libeller les conversations de msgstore.db
        sources.sort(key=lambda x: x.kind != "whatsapp_contacts")
        for i, src in enumerate(sources):
            try:
                if src.kind in ("signal", "whatsapp_crypt"):
                    limitations.append(_unreadable_note(src))
                    continue
                if src.kind == "whatsapp_contacts":
                    con, wal = open_copy(src.path, work, i)
                    try:
                        k, names = parse_whatsapp_contacts(con, src, emit)
                    finally:
                        con.close()
                    wa_names[str(PurePosixPath(src.rel).parent)] = names
                    counts["whatsapp"] = counts.get("whatsapp", 0) + k
                    wal_files += wal
                elif src.kind == "whatsapp":
                    con, wal = open_copy(src.path, work, i)
                    try:
                        k = parse_whatsapp(con, src, emit, wa_names.get(str(PurePosixPath(src.rel).parent), {}))
                    finally:
                        con.close()
                    counts["whatsapp"] = counts.get("whatsapp", 0) + k
                    wal_files += wal
                elif src.kind in DB_PARSERS:
                    con, wal = open_copy(src.path, work, i)
                    try:
                        counts[src.kind] = counts.get(src.kind, 0) + DB_PARSERS[src.kind](con, src, emit)
                    finally:
                        con.close()
                    wal_files += wal
                elif src.kind == "image":
                    counts["image"] = counts.get("image", 0) + parse_image(src, emit)
                else:
                    text = src.path.read_text(encoding="utf-8", errors="replace")
                    pkg_text = text if src.kind == "dumpsys_package" else (
                        dumpsys_section(text, "package") if src.kind == "dumpsys_all" else None)
                    acc_text = text if src.kind == "dumpsys_accessibility" else (
                        dumpsys_section(text, "accessibility") if src.kind == "dumpsys_all" else None)
                    if pkg_text:
                        dumpsys_apps += [(src, a) for a in parse_dumpsys_package(pkg_text)]
                    if acc_text:
                        accessibility = (accessibility or set()) | parse_dumpsys_accessibility(acc_text)
            except sqlite3.DatabaseError as exc:
                notes.append(f"{src.rel} : base illisible ({exc}).")
            except ToolFailed as exc:
                notes.append(f"{src.rel} : {exc}.")
                if "Pillow" in str(exc):
                    break
        for src, a in dumpsys_apps:
            if accessibility is not None:
                a["accessibility_service_enabled"] = a["package"] in accessibility
            emit("application", None, a, src, f"dumpsys package [{a['package']}]")
        for pkg in sorted((accessibility or set()) - {a["package"] for _, a in dumpsys_apps}):
            emit("application", None, {"package": pkg, "accessibility_service_enabled": True},
                 Source("dumpsys_accessibility", "dumpsys accessibility", extraction), "Enabled services")
        if dumpsys_apps or accessibility:
            counts["dumpsys"] = len(dumpsys_apps)

        if not sources:
            notes.append("Aucune source prise en charge trouvée (mmssms.db, calllog.db, contacts2.db, History, "
                         "photos, dumpsys).")
        summary = ", ".join(f"{k} : {v}" for k, v in sorted(counts.items()))
        notes.insert(0, f"{len(sources)} source(s) lue(s)" + (f" ; artefacts par type de source : {summary}" if summary else "") + ".")
        if wal_files:
            notes.append(f"{wal_files} journal(aux) WAL rejoué(s) sur copie de travail.")
        if builder.internal_duplicates:
            notes.append(f"{builder.internal_duplicates} doublon(s) interne(s) fusionné(s).")
        notes.append("Enregistrements supprimés (pages libres SQLite) non récupérés.")
        notes += limitations
        return WrapperResult(tool=TOOL, mode="execute", command=["veritrace", "parse", "sqlite"], started_at=started,
                             ended_at=utc_now_iso(), output_path=None, artifacts=builder.items, notes=notes,
                             limitations=limitations)
