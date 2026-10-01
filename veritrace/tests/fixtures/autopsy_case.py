"""Cas Autopsy SYNTHÉTIQUE : base `autopsy.db` au schéma Sleuth Kit (tables blackboard).

Reproduit ce que l'Android Analyzer d'Autopsy produirait sur l'extraction de
`android_fs.py` (mêmes faits → corroboration avec ALEAPP), plus :
- un point GPS émis par le module « Android Analyzer (aLEAPP) » : même moteur
  qu'ALEAPP, il ne doit PAS compter comme corroboration indépendante ;
- un historique web du module « Recent Activity » (hors module Android) : ignoré par défaut ;
- un SMS dupliqué (même fait deux fois) : dédoublonné.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ARTIFACT_TYPES = {"TSK_WEB_HISTORY": 4, "TSK_GPS_TRACKPOINT": 7, "TSK_INSTALLED_PROG": 8, "TSK_CONTACT": 23,
                  "TSK_MESSAGE": 24, "TSK_CALLLOG": 25, "TSK_BLUETOOTH_PAIRING": 30, "TSK_SERVICE_ACCOUNT": 32}
# (nom, type de valeur) — 0 texte, 1 int32, 2 int64, 3 double, 5 date (epoch s)
ATTRIBUTE_TYPES = {
    "TSK_URL": (1, 0), "TSK_DATETIME": (2, 5), "TSK_NAME": (3, 0), "TSK_PROG_NAME": (4, 0), "TSK_TITLE": (5, 0),
    "TSK_GEO_LATITUDE": (6, 3), "TSK_GEO_LONGITUDE": (7, 3), "TSK_PHONE_NUMBER": (8, 0),
    "TSK_PHONE_NUMBER_FROM": (9, 0), "TSK_PHONE_NUMBER_TO": (10, 0), "TSK_DIRECTION": (11, 0), "TSK_TEXT": (12, 0),
    "TSK_MESSAGE_TYPE": (13, 0), "TSK_DATETIME_START": (14, 5), "TSK_DATETIME_END": (15, 5),
    "TSK_MAC_ADDRESS": (16, 0), "TSK_DEVICE_NAME": (17, 0), "TSK_USER_ID": (18, 0), "TSK_CATEGORY": (19, 0),
    "TSK_DATETIME_ACCESSED": (20, 5), "TSK_READ_STATUS": (21, 1),
}


def _ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp())


def build_autopsy_case(root: str | Path) -> Path:
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    (root / "VT-TEST.aut").write_text("<AutopsyCase><SchemaVersion>5.0</SchemaVersion></AutopsyCase>\n")
    con = sqlite3.connect(root / "autopsy.db")
    con.executescript("""
        CREATE TABLE tsk_db_info (schema_ver INTEGER, tsk_ver INTEGER, schema_minor_ver INTEGER);
        CREATE TABLE tsk_files (obj_id INTEGER PRIMARY KEY, name TEXT, parent_path TEXT);
        CREATE TABLE blackboard_artifact_types (artifact_type_id INTEGER PRIMARY KEY, type_name TEXT,
            display_name TEXT, category_type INTEGER);
        CREATE TABLE blackboard_attribute_types (attribute_type_id INTEGER PRIMARY KEY, type_name TEXT,
            display_name TEXT, value_type INTEGER);
        CREATE TABLE blackboard_artifacts (artifact_id INTEGER PRIMARY KEY, obj_id INTEGER, artifact_obj_id INTEGER,
            data_source_obj_id INTEGER, artifact_type_id INTEGER, review_status_id INTEGER);
        CREATE TABLE blackboard_attributes (artifact_id INTEGER, artifact_type_id INTEGER, source TEXT, context TEXT,
            attribute_type_id INTEGER, value_type INTEGER, value_byte BLOB, value_text TEXT, value_int32 INTEGER,
            value_int64 INTEGER, value_double REAL);
    """)
    con.execute("INSERT INTO tsk_db_info VALUES (9, 4130000, 4)")
    files = {1: ("mmssms.db", "/data/data/com.android.providers.telephony/databases/"),
             2: ("calllog.db", "/data/data/com.android.providers.contacts/databases/"),
             3: ("packages.xml", "/data/system/"),
             4: ("bt_config.conf", "/data/misc/bluedroid/"),
             5: ("accounts_ce.db", "/data/system_ce/0/"),
             6: ("CachedGeoposition.db", "/data/data/com.android.browser/app_geolocation/"),
             7: ("History", "/data/data/com.android.chrome/app_chrome/Default/")}
    con.executemany("INSERT INTO tsk_files VALUES (?,?,?)", [(k, *v) for k, v in files.items()])
    con.executemany("INSERT INTO blackboard_artifact_types VALUES (?,?,?,0)",
                    [(i, n, n) for n, i in ARTIFACT_TYPES.items()])
    con.executemany("INSERT INTO blackboard_attribute_types VALUES (?,?,?,?)",
                    [(i, n, n, vt) for n, (i, vt) in ATTRIBUTE_TYPES.items()])

    next_id = [1000]

    def art(atype: str, obj: int, module: str, attrs: dict) -> None:
        aid = next_id[0]
        next_id[0] += 1
        con.execute("INSERT INTO blackboard_artifacts VALUES (?,?,?,1,?,0)", (aid, obj, aid + 50000, ARTIFACT_TYPES[atype]))
        for name, value in attrs.items():
            tid, vt = ATTRIBUTE_TYPES[name]
            cols = {0: (value, None, None, None), 1: (None, value, None, None), 2: (None, None, value, None),
                    3: (None, None, None, value), 5: (None, None, value, None)}[vt]
            con.execute("INSERT INTO blackboard_attributes VALUES (?,?,?,'',?,?,NULL,?,?,?,?)",
                        (aid, ARTIFACT_TYPES[atype], module, tid, vt, *cols))

    A = "Android Analyzer"
    sms = {"TSK_DATETIME": _ts("2026-09-02T19:44:05"), "TSK_PHONE_NUMBER_FROM": "+226 70 00 00 01",
           "TSK_DIRECTION": "Incoming", "TSK_TEXT": "Je sais où tu étais hier soir.", "TSK_MESSAGE_TYPE": "SMS Message",
           "TSK_READ_STATUS": 1}
    art("TSK_MESSAGE", 1, A, sms)
    art("TSK_MESSAGE", 1, A, sms)  # doublon
    art("TSK_CALLLOG", 2, A, {"TSK_DATETIME_START": _ts("2026-09-02T20:01:47"), "TSK_DATETIME_END": _ts("2026-09-02T20:01:47"),
                              "TSK_PHONE_NUMBER_FROM": "+22670000001", "TSK_DIRECTION": "Incoming"})
    art("TSK_INSTALLED_PROG", 3, A, {"TSK_PROG_NAME": "com.sys.monitor.service",
                                     "TSK_DATETIME": _ts("2026-08-14T21:03:11")})
    art("TSK_BLUETOOTH_PAIRING", 4, A, {"TSK_MAC_ADDRESS": "00:1a:7d:00:00:02", "TSK_DEVICE_NAME": "Ecouteurs BT",
                                        "TSK_DATETIME": _ts("2026-08-30T08:12:00")})
    art("TSK_SERVICE_ACCOUNT", 5, A, {"TSK_USER_ID": "titulaire.exemple@example.invalid", "TSK_CATEGORY": "com.google"})
    art("TSK_GPS_TRACKPOINT", 6, "Android Analyzer (aLEAPP)",
        {"TSK_GEO_LATITUDE": 11.7802, "TSK_GEO_LONGITUDE": -0.3703, "TSK_DATETIME": _ts("2026-09-01T22:15:30")})
    art("TSK_WEB_HISTORY", 7, "Recent Activity",
        {"TSK_URL": "https://download.example-monitor.invalid/apk/latest", "TSK_TITLE": "Download",
         "TSK_DATETIME_ACCESSED": _ts("2026-08-14T20:58:42"), "TSK_PROG_NAME": "Chrome"})
    con.commit()
    con.close()
    return root
