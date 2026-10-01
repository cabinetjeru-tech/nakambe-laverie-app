"""Extraction SYNTHÉTIQUE avec enregistrements SUPPRIMÉS (données fictives) pour `veritrace-recover`.

Chaque base reproduit un mécanisme de conservation distinct :

| Base | Mécanisme | Attendu |
|---|---|---|
| mmssms.db | suppression sans effacement sécurisé → blocs libres ; un SMS seulement marqué « lu » | 2 SMS absents ; le SMS lu n'est PAS signalé |
| calllog.db | suppression massive sans auto-vacuum → pages libres | appels absents (pages libres) |
| msgstore.db (WhatsApp) | WAL non consolidé + effacement sécurisé (comme Android) | message supprimé et texte avant modification, lus dans l'ancienne version de la page |
| History (Chrome) | journal de rollback en mode PERSIST | URL supprimée lue dans le journal |
| viber_messages | effacement sécurisé, sans WAL | rien de récupérable ; effacement sécurisé constaté |

    python -m veritrace.demo.deleted /chemin/sortie
"""
from __future__ import annotations

import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

SMS_DELETED = ("Rendez-vous ce soir derrière le marché, viens seul.", "Efface ce message après lecture.")
SMS_READ_ONLY = "Bonjour, ta commande est prête."
WA_DELETED = "Le colis est arrivé, on se voit demain à 9 h."
WA_EDITED_BEFORE, WA_EDITED_AFTER = "Je t'envoie 500 000 FCFA ce soir.", "Je t'envoie l'argent ce soir."
URL_DELETED = "https://transfert-rapide.example/recu?id=8841"
CALL_DELETED_NUMBER = "+22670009070"


def _ms(iso: str) -> int:
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


def _webkit(iso: str) -> int:
    return (_ms(iso) + 11644473600000) * 1000


def _connect(path: Path, *, secure: bool, journal: str = "DELETE", auto_vacuum: str = "NONE") -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    con = sqlite3.connect(path, isolation_level=None)
    con.execute(f"PRAGMA auto_vacuum={auto_vacuum}")
    con.execute(f"PRAGMA secure_delete={'ON' if secure else 'OFF'}")
    con.execute(f"PRAGMA journal_mode={journal}")
    return con


SMS_DDL = ("CREATE TABLE sms (_id INTEGER PRIMARY KEY, thread_id INTEGER, address TEXT, person INTEGER, date INTEGER,"
           " date_sent INTEGER DEFAULT 0, protocol INTEGER, read INTEGER DEFAULT 0, status INTEGER DEFAULT -1,"
           " type INTEGER, reply_path_present INTEGER, subject TEXT, body TEXT, service_center TEXT,"
           " locked INTEGER DEFAULT 0, sub_id INTEGER DEFAULT -1, error_code INTEGER DEFAULT 0, creator TEXT,"
           " seen INTEGER DEFAULT 0)")


def build_sms(data: Path) -> None:
    con = _connect(data / "data/com.android.providers.telephony/databases/mmssms.db", secure=False)
    con.execute(SMS_DDL)
    con.execute("CREATE TABLE threads (_id INTEGER PRIMARY KEY, date INTEGER, message_count INTEGER, snippet TEXT)")
    rows = [(1, "+22670000001", "2026-09-10T08:00:00", 1, SMS_READ_ONLY),
            (2, "+22670000001", "2026-09-10T08:05:00", 2, "Merci, je passe la prendre."),
            (3, "+22670000002", "2026-09-11T21:30:00", 1, SMS_DELETED[0]),
            (4, "+22670000003", "2026-09-12T10:00:00", 1, "Réunion décalée à 15 h."),
            (5, "+22670000002", "2026-09-12T23:10:00", 1, SMS_DELETED[1]),
            (6, "+22670000003", "2026-09-13T09:00:00", 2, "Bien reçu.")]
    con.execute("BEGIN")
    for i, addr, ts, typ, body in rows:
        con.execute("INSERT INTO sms (_id, thread_id, address, date, read, type, body, seen) VALUES (?,?,?,?,?,?,?,?)",
                    (i, 1, addr, _ms(ts), 0 if typ == 1 else 1, typ, body, 1))
    con.execute("COMMIT")
    con.execute("DELETE FROM sms WHERE _id IN (3, 5)")
    con.execute("UPDATE sms SET read = 1 WHERE _id = 1")   # simple changement d'état : pas une suppression
    con.close()


def build_calllog(data: Path) -> None:
    con = _connect(data / "data/com.android.providers.contacts/databases/calllog.db", secure=False)
    con.execute("CREATE TABLE calls (_id INTEGER PRIMARY KEY, number TEXT, date INTEGER, duration INTEGER,"
                " type INTEGER, new INTEGER, name TEXT, numbertype INTEGER, countryiso TEXT, geocoded_location TEXT)")
    con.execute("BEGIN")
    for i in range(1, 121):
        con.execute("INSERT INTO calls VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (i, f"+226700090{i:02d}" if i < 100 else f"+2267001{i:04d}",
                     _ms("2026-08-01T08:00:00") + i * 3_600_000, 30 + i, 1 + i % 3, 0,
                     f"Correspondant {i:03d} — " + "x" * 60, 2, "BF", "Ouagadougou, Burkina Faso"))
    con.execute("COMMIT")
    con.execute("DELETE FROM calls WHERE _id BETWEEN 21 AND 90")  # pages entières libérées
    con.close()


WA_DDL = [
    "CREATE TABLE jid (_id INTEGER PRIMARY KEY, user TEXT, server TEXT, agent INTEGER, device INTEGER,"
    " type INTEGER, raw_string TEXT)",
    "CREATE TABLE chat (_id INTEGER PRIMARY KEY, jid_row_id INTEGER, subject TEXT, created_timestamp INTEGER)",
    "CREATE TABLE message (_id INTEGER PRIMARY KEY AUTOINCREMENT, chat_row_id INTEGER, from_me INTEGER, key_id TEXT,"
    " sender_jid_row_id INTEGER, status INTEGER, timestamp INTEGER, received_timestamp INTEGER,"
    " message_type INTEGER, text_data TEXT, recipient_count INTEGER)",
    "CREATE TABLE message_media (message_row_id INTEGER, file_path TEXT, file_size INTEGER, mime_type TEXT)",
]


def build_whatsapp(data: Path) -> None:
    """WAL laissé NON consolidé : les fichiers sont copiés pendant que la connexion est ouverte."""
    final = data / "data/com.whatsapp/databases"
    tmp = final.parent / "_tmp_wa"
    con = _connect(tmp / "msgstore.db", secure=True, journal="WAL")
    con.execute("PRAGMA wal_autocheckpoint=0")
    for s in WA_DDL:
        con.execute(s)
    con.execute("BEGIN")
    con.execute("INSERT INTO jid VALUES (1, '22670000002', 's.whatsapp.net', 0, 0, 0, '22670000002@s.whatsapp.net')")
    con.execute("INSERT INTO chat VALUES (1, 1, NULL, NULL)")
    msgs = [(1, 0, "2026-09-11T20:00:00", "Tu es où ?"),
            (2, 1, "2026-09-11T20:02:00", WA_EDITED_BEFORE),
            (3, 0, "2026-09-11T20:03:00", WA_DELETED),
            (4, 1, "2026-09-11T20:05:00", "Ok.")]
    for i, me, ts, text in msgs:
        con.execute("INSERT INTO message VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (i, 1, me, f"KEY{i}", None, 13, _ms(ts), _ms(ts), 0, text, None))
    con.execute("COMMIT")
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")        # état « ancien » consolidé dans le fichier principal
    con.execute("DELETE FROM message WHERE _id = 3")      # suppression « pour tous »
    con.execute("UPDATE message SET text_data = ? WHERE _id = 2", (WA_EDITED_AFTER,))  # message modifié
    final.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal"):
        shutil.copyfile(tmp / f"msgstore.db{suffix}", final / f"msgstore.db{suffix}")
    con.close()
    shutil.rmtree(tmp)


def build_chrome(data: Path) -> None:
    con = _connect(data / "data/com.android.chrome/app_chrome/Default/History", secure=False, journal="PERSIST")
    con.execute("CREATE TABLE urls (id INTEGER PRIMARY KEY AUTOINCREMENT, url LONGVARCHAR, title LONGVARCHAR,"
                " visit_count INTEGER DEFAULT 0 NOT NULL, typed_count INTEGER DEFAULT 0 NOT NULL,"
                " last_visit_time INTEGER NOT NULL, hidden INTEGER DEFAULT 0 NOT NULL)")
    con.execute("BEGIN")
    for i, url, title, ts in [(1, "https://news.example/", "Actualités", "2026-09-10T07:00:00"),
                              (2, URL_DELETED, "Reçu de transfert", "2026-09-11T21:45:00"),
                              (3, "https://meteo.example/ouaga", "Météo", "2026-09-12T06:30:00")]:
        con.execute("INSERT INTO urls VALUES (?,?,?,?,?,?,?)", (i, url, title, 1, 0, _webkit(ts), 0))
    con.execute("COMMIT")
    con.execute("DELETE FROM urls WHERE id = 2")
    con.close()


def build_viber(data: Path) -> None:
    con = _connect(data / "data/com.viber.voip/databases/viber_messages", secure=True)
    con.execute("CREATE TABLE participants_info (_id INTEGER PRIMARY KEY, number TEXT, display_name TEXT)")
    con.execute("CREATE TABLE participants (_id INTEGER PRIMARY KEY, conversation_id INTEGER, participant_info_id INTEGER)")
    con.execute("CREATE TABLE messages (_id INTEGER PRIMARY KEY, conversation_id INTEGER, participant_id INTEGER,"
                " msg_date INTEGER, send_type INTEGER, unread INTEGER, body TEXT, extra_uri TEXT)")
    con.execute("INSERT INTO participants_info VALUES (1, '+22670000005', 'Contact E')")
    con.execute("INSERT INTO participants VALUES (1, 1, 1)")
    con.execute("BEGIN")
    for i in range(1, 5):
        con.execute("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)",
                    (i, 1, 1, _ms("2026-09-14T10:00:00") + i * 60000, i % 2, 0, f"Message Viber {i} à effacer", None))
    con.execute("COMMIT")
    con.execute("DELETE FROM messages WHERE _id IN (2, 3)")
    con.close()


def build_deleted_fs(root: str | Path) -> Path:
    root = Path(root)
    data = root / "data"
    build_sms(data)
    build_calllog(data)
    build_whatsapp(data)
    build_chrome(data)
    build_viber(data)
    return root


if __name__ == "__main__":  # pragma: no cover
    print(build_deleted_fs(sys.argv[1] if len(sys.argv) > 1 else "deleted_fs"))
