"""Bases de messageries tierces SYNTHÉTIQUES (données fictives), aux schémas lus par ALEAPP.

WhatsApp (msgstore.db moderne + wa.db), Viber (viber_messages / viber_data), Facebook
Messenger (threads_db2), Telegram (cache4.db : message sérialisé TL réel), et deux
éléments volontairement illisibles : base Signal chiffrée (SQLCipher) et sauvegarde
WhatsApp chiffrée (.crypt14).
"""
from __future__ import annotations

import json
import sqlite3
import struct
from datetime import datetime, timezone
from pathlib import Path


def _ms(iso: str) -> int:
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


def _db(path: Path, ddl: list[str], rows: list[tuple[str, tuple]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    for s in ddl:
        con.execute(s)
    for sql, values in rows:
        con.execute(sql, values)
    con.commit()
    con.close()


# --------------------------------------------------------------------------- Telegram (TL)
PEER_USER = 0x59511722
TL_MESSAGE = 0x58AE39C9          # TL_message (couche sans second champ de drapeaux)


def tl_string(text: str) -> bytes:
    raw = text.encode("utf-8")
    assert len(raw) < 254
    out = bytes([len(raw)]) + raw
    return out + b"\x00" * (-len(out) % 4)


def tl_message(mid: int, peer_user: int, sender: int | None, date: int, text: str) -> bytes:
    flags = (1 << 8) if sender is not None else (1 << 1)     # from_id présent | message sortant
    blob = struct.pack("<II", TL_MESSAGE, flags) + struct.pack("<i", mid)
    if sender is not None:
        blob += struct.pack("<Iq", PEER_USER, sender)
    blob += struct.pack("<Iq", PEER_USER, peer_user) + struct.pack("<i", date) + tl_string(text)
    return blob + struct.pack("<I", 0)                       # suite (media vide) : ignorée


def build_messaging(data: Path) -> None:
    """`data` = dossier /data de l'extraction (et media/0 pour le stockage partagé)."""
    wa = data / "data/com.whatsapp/databases"
    _db(wa / "wa.db",
        ["CREATE TABLE wa_contacts (_id INTEGER PRIMARY KEY, jid TEXT, is_whatsapp_user INTEGER, status TEXT,"
         " status_timestamp INTEGER, number TEXT, display_name TEXT, given_name TEXT, family_name TEXT, wa_name TEXT)"],
        [("INSERT INTO wa_contacts VALUES (?,?,?,?,?,?,?,?,?,?)",
          (1, "22670000001@s.whatsapp.net", 1, "Dispo", None, "+22670000001", "Contact A", "Contact", "A", "Contact A")),
         ("INSERT INTO wa_contacts VALUES (?,?,?,?,?,?,?,?,?,?)",
          (2, "22670000004@s.whatsapp.net", 1, None, None, "+22670000004", "Contact D", "Contact", "D", "Contact D"))])
    _db(wa / "msgstore.db",
        ["CREATE TABLE jid (_id INTEGER PRIMARY KEY, user TEXT, server TEXT, agent INTEGER, device INTEGER,"
         " type INTEGER, raw_string TEXT)",
         "CREATE TABLE chat (_id INTEGER PRIMARY KEY, jid_row_id INTEGER, subject TEXT, created_timestamp INTEGER)",
         "CREATE TABLE message (_id INTEGER PRIMARY KEY, chat_row_id INTEGER, from_me INTEGER, key_id TEXT,"
         " sender_jid_row_id INTEGER, status INTEGER, timestamp INTEGER, received_timestamp INTEGER,"
         " message_type INTEGER, text_data TEXT, recipient_count INTEGER)",
         "CREATE TABLE message_media (message_row_id INTEGER, file_path TEXT, file_size INTEGER, mime_type TEXT)",
         "CREATE TABLE message_location (message_row_id INTEGER, latitude REAL, longitude REAL,"
         " live_location_share_duration INTEGER, live_location_final_latitude REAL,"
         " live_location_final_longitude REAL, live_location_final_timestamp INTEGER)",
         "CREATE TABLE call_log (_id INTEGER PRIMARY KEY, jid_row_id INTEGER, from_me INTEGER, call_id TEXT,"
         " transaction_id INTEGER, timestamp INTEGER, video_call INTEGER, duration INTEGER, call_result INTEGER,"
         " group_jid_row_id INTEGER)"],
        [("INSERT INTO jid VALUES (?,?,?,?,?,?,?)", (1, "22670000001", "s.whatsapp.net", 0, 0, 0, "22670000001@s.whatsapp.net")),
         ("INSERT INTO jid VALUES (?,?,?,?,?,?,?)", (2, "120363000000000001", "g.us", 0, 0, 1, "120363000000000001@g.us")),
         ("INSERT INTO jid VALUES (?,?,?,?,?,?,?)", (3, "22670000004", "s.whatsapp.net", 0, 0, 0, "22670000004@s.whatsapp.net")),
         ("INSERT INTO chat VALUES (?,?,?,?)", (1, 1, None, None)),
         ("INSERT INTO chat VALUES (?,?,?,?)", (2, 2, "Famille", _ms("2026-01-05T09:00:00"))),
         ("INSERT INTO message VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          (10, 1, 0, "K10", None, 13, _ms("2026-09-02T19:30:00"), _ms("2026-09-02T19:30:02"), 0,
           "Tu es encore au marché ?", 0)),
         ("INSERT INTO message VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          (11, 1, 1, "K11", None, 13, _ms("2026-09-02T19:31:10"), 0, 0, "Laisse-moi tranquille.", 0)),
         ("INSERT INTO message VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          (12, 1, 0, "K12", None, 13, _ms("2026-09-02T19:35:00"), _ms("2026-09-02T19:35:01"), 1, None, 0)),
         ("INSERT INTO message VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          (13, 2, 0, "K13", 3, 13, _ms("2026-09-03T07:45:00"), _ms("2026-09-03T07:45:03"), 0,
           "Réunion de famille dimanche.", 2)),
         ("INSERT INTO message_media VALUES (?,?,?,?)",
          (12, "Media/WhatsApp Images/IMG-20260902-WA0001.jpg", 48211, "image/jpeg")),
         ("INSERT INTO call_log VALUES (?,?,?,?,?,?,?,?,?,?)",
          (1, 1, 0, "C1", 1, _ms("2026-09-02T21:10:00"), 1, 42, 5, None))])
    (data / "media/0/WhatsApp/Databases").mkdir(parents=True, exist_ok=True)
    (data / "media/0/WhatsApp/Databases/msgstore-2026-09-01.1.db.crypt14").write_bytes(
        b"\x00\x01" + bytes(range(256)) * 4)                                  # chiffré : non lisible

    vb = data / "data/com.viber.voip/databases"
    _db(vb / "viber_messages",
        ["CREATE TABLE participants_info (_id INTEGER PRIMARY KEY, number TEXT, display_name TEXT)",
         "CREATE TABLE participants (_id INTEGER PRIMARY KEY, conversation_id INTEGER, participant_info_id INTEGER)",
         "CREATE TABLE conversations (_id INTEGER PRIMARY KEY, name TEXT, conversation_type INTEGER)",
         "CREATE TABLE messages (_id INTEGER PRIMARY KEY, msg_date INTEGER, participant_id INTEGER,"
         " conversation_id INTEGER, body TEXT, send_type INTEGER, unread INTEGER, extra_uri TEXT)"],
        [("INSERT INTO participants_info VALUES (?,?,?)", (1, "+22670000099", "Moi")),
         ("INSERT INTO participants_info VALUES (?,?,?)", (2, "+22670000002", "Contact B")),
         ("INSERT INTO conversations VALUES (?,?,?)", (1, None, 0)),
         ("INSERT INTO participants VALUES (?,?,?)", (1, 1, 1)),
         ("INSERT INTO participants VALUES (?,?,?)", (2, 1, 2)),
         ("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)",
          (1, _ms("2026-09-01T08:00:00"), 2, 1, "On se voit ce soir ?", 0, 0, None)),
         ("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)",
          (2, _ms("2026-09-01T08:05:00"), 1, 1, "Non.", 1, 0, None))])
    _db(vb / "viber_data",
        ["CREATE TABLE calls (_id INTEGER PRIMARY KEY, date INTEGER, canonized_number TEXT, type INTEGER,"
         " duration INTEGER, viber_call_type INTEGER)",
         "CREATE TABLE phonebookcontact (_id INTEGER PRIMARY KEY, display_name TEXT)",
         "CREATE TABLE phonebookdata (_id INTEGER PRIMARY KEY, contact_id INTEGER, data1 TEXT, data2 TEXT, data3 TEXT)"],
        [("INSERT INTO calls VALUES (?,?,?,?,?,?)", (1, _ms("2026-09-01T08:10:00"), "+22670000002", 2, 65, 1)),
         ("INSERT INTO phonebookcontact VALUES (?,?)", (1, "Contact B")),
         ("INSERT INTO phonebookdata VALUES (?,?,?,?,?)", (1, 1, "+22670000002", None, None))])

    fb = data / "data/com.facebook.orca/databases"
    _db(fb / "threads_db2",
        ["CREATE TABLE threads (thread_key TEXT PRIMARY KEY, name TEXT)",
         "CREATE TABLE messages (msg_id TEXT PRIMARY KEY, thread_key TEXT, timestamp_ms INTEGER, sender TEXT,"
         " text TEXT, snippet TEXT, attachments TEXT, shares TEXT, msg_type INTEGER,"
         " generic_admin_message_extensible_data TEXT)",
         "CREATE TABLE message_reactions (msg_id TEXT, reaction TEXT, reaction_timestamp INTEGER)"],
        [("INSERT INTO threads VALUES (?,?)", ("ONE_TO_ONE:100001:100002", None)),
         ("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?)",
          ("mid.1", "ONE_TO_ONE:100001:100002", _ms("2026-08-20T12:00:00"),
           json.dumps({"user_key": "FACEBOOK:100002", "name": "Contact C"}), "Tu as vu mon message ?", None,
           None, None, 0, None))])

    tg = data / "data/org.telegram.messenger/files"
    date = int(datetime(2026, 9, 2, 22, 0, tzinfo=timezone.utc).timestamp())
    _db(tg / "cache4.db",
        ["CREATE TABLE messages_v2 (mid INTEGER, uid INTEGER, read_state INTEGER, send_state INTEGER, date INTEGER,"
         " data BLOB, out INTEGER, ttl INTEGER, media INTEGER, replydata BLOB, imp INTEGER, mention INTEGER,"
         " forwards INTEGER, replies_data BLOB, thread_reply_id INTEGER, is_channel INTEGER,"
         " reply_to_message_id INTEGER, custom_params BLOB, group_id INTEGER, reply_to_story_id INTEGER,"
         " PRIMARY KEY(mid, uid))",
         "CREATE TABLE users (uid INTEGER PRIMARY KEY, name TEXT, status INTEGER, data BLOB)",
         "CREATE TABLE chats (uid INTEGER PRIMARY KEY, name TEXT, data BLOB)",
         "CREATE TABLE dialogs (did INTEGER PRIMARY KEY, date INTEGER, unread_count INTEGER, last_mid INTEGER,"
         " inbox_max INTEGER, outbox_max INTEGER, last_mid_i INTEGER, unread_count_i INTEGER, pts INTEGER,"
         " date_i INTEGER, pinned INTEGER, flags INTEGER, folder_id INTEGER, data BLOB, unread_reactions INTEGER,"
         " last_mid_group INTEGER, ttl_period INTEGER)"],
        [("INSERT INTO users VALUES (?,?,?,?)", (123456789, "Contact Telegram;;;contact_tg", 0, None)),
         ("INSERT INTO messages_v2 (mid, uid, read_state, send_state, date, data, out) VALUES (?,?,?,?,?,?,?)",
          (501, 123456789, 1, 0, date, tl_message(501, 123456789, 123456789, date, "Je te surveille."), 0))])

    sig = data / "data/org.thoughtcrime.securesms/databases"
    sig.mkdir(parents=True, exist_ok=True)
    (sig / "signal.db").write_bytes(bytes((i * 37 + 11) % 256 for i in range(8192)))  # SQLCipher : opaque
