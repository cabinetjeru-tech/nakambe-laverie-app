"""Extraction logique Android SYNTHÉTIQUE (données fictives) pour les tests d'intégration.

Reproduit l'arborescence et les schémas SQLite/XML réels d'Android que lisent ALEAPP
(et l'analyseur Android d'Autopsy) : SMS, journal d'appels, Chrome, packages.xml,
comptes, Wi-Fi, Bluetooth, géolocalisation. Utilisable aussi en ligne de commande :

    python -m tests.fixtures.android_fs /chemin/sortie
"""
from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

SPY_PKG = "com.sys.monitor.service"


def _ms(iso: str) -> int:
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


def _webkit(iso: str) -> int:
    # Chrome : microsecondes depuis 1601-01-01
    return (_ms(iso) + 11644473600000) * 1000


def _db(path: Path, ddl: list[str], rows: list[tuple[str, tuple]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    for s in ddl:
        con.execute(s)
    for sql, values in rows:
        con.execute(sql, values)
    con.commit()
    con.close()


def build_android_fs(root: str | Path) -> Path:
    root = Path(root)
    data = root / "data"

    _db(data / "data/com.android.providers.telephony/databases/mmssms.db",
        ["CREATE TABLE sms (_id INTEGER PRIMARY KEY, thread_id INTEGER, address TEXT, person INTEGER, date INTEGER,"
         " date_sent INTEGER, read INTEGER, type INTEGER, body TEXT, service_center TEXT, error_code INTEGER)",
         "CREATE TABLE pdu (_id INTEGER PRIMARY KEY, thread_id INTEGER, date INTEGER, date_sent INTEGER, read INTEGER, msg_box INTEGER)",
         "CREATE TABLE part (_id INTEGER PRIMARY KEY, mid INTEGER, seq INTEGER, ct TEXT, cl TEXT, _data TEXT, text TEXT)",
         "CREATE TABLE addr (_id INTEGER PRIMARY KEY, msg_id INTEGER, address TEXT, type INTEGER)"],
        [("INSERT INTO sms VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          (4471, 12, "+22670000001", None, _ms("2026-09-02T19:44:05"), _ms("2026-09-02T19:44:03"), 1, 1,
           "Je sais où tu étais hier soir.", None, 0)),
         ("INSERT INTO sms VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          (4472, 12, "+22670000001", None, _ms("2026-09-02T19:50:00"), _ms("2026-09-02T19:50:00"), 1, 2,
           "Arrête de m'écrire.", None, 0))])

    _db(data / "data/com.android.providers.contacts/databases/calllog.db",
        ["CREATE TABLE calls (_id INTEGER PRIMARY KEY, date INTEGER, phone_account_address TEXT, number TEXT,"
         " type INTEGER, duration INTEGER, geocoded_location TEXT, countryiso TEXT, _data TEXT, mime_type TEXT,"
         " transcription TEXT, deleted INTEGER)"],
        [("INSERT INTO calls VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          (902, _ms("2026-09-02T20:01:47"), None, "+22670000001", 3, 0, "Burkina Faso", "BF", None, None, None, 0)),
         ("INSERT INTO calls VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          (903, _ms("2026-09-03T08:15:00"), None, "+22670000002", 2, 125, None, "BF", None, None, None, 0))])

    _db(data / "data/com.android.chrome/app_chrome/Default/History",
        ["CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, typed_count INTEGER,"
         " last_visit_time INTEGER, hidden INTEGER)",
         "CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER, from_visit INTEGER,"
         " transition INTEGER, segment_id INTEGER, visit_duration INTEGER)"],
        [("INSERT INTO urls VALUES (?,?,?,?,?,?,?)",
          (311, "https://download.example-monitor.invalid/apk/latest", "Download", 1, 1,
           _webkit("2026-08-14T20:58:42"), 0))])

    xml = data / "system/packages.xml"
    xml.parent.mkdir(parents=True, exist_ok=True)
    it = format(_ms("2026-08-14T21:03:11"), "x")
    it2 = format(_ms("2025-01-10T10:00:00"), "x")
    xml.write_text(
        "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<packages>\n"
        f'  <package name="{SPY_PKG}" codePath="/data/app/~~x/{SPY_PKG}-1" ft="{it}" it="{it}" ut="{it}"'
        ' version="421" userId="10245" />\n'
        f'  <package name="com.whatsapp" codePath="/data/app/~~y/com.whatsapp-1" ft="{it2}" it="{it2}" ut="{it2}"'
        ' version="1" userId="10150" installer="com.android.vending" installOriginator="com.android.vending" />\n'
        "</packages>\n", encoding="utf-8")

    _db(data / "system_ce/0/accounts_ce.db",
        ["CREATE TABLE accounts (_id INTEGER PRIMARY KEY, name TEXT, type TEXT, password TEXT)"],
        [("INSERT INTO accounts VALUES (?,?,?,?)", (1, "titulaire.exemple@example.invalid", "com.google", None))])

    wifi = data / "misc/apexdata/com.android.wifi/WifiConfigStore.xml"
    wifi.parent.mkdir(parents=True, exist_ok=True)
    wifi.write_text(
        "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<WifiConfigStoreData>\n<NetworkList>\n<Network>\n"
        "<WifiConfiguration>\n<string name=\"ConfigKey\">&quot;MAISON-WIFI&quot;WPA_PSK</string>\n"
        "<string name=\"SSID\">&quot;MAISON-WIFI&quot;</string>\n"
        "<string name=\"DefaultGwMacAddress\">a4:2b:b0:00:00:01</string>\n"
        f"<long name=\"LastConnectedTime\" value=\"{_ms('2026-09-02T18:00:00')}\" />\n"
        "</WifiConfiguration>\n</Network>\n</NetworkList>\n</WifiConfigStoreData>\n", encoding="utf-8")

    bt = data / "misc/bluedroid/bt_config.conf"
    bt.parent.mkdir(parents=True, exist_ok=True)
    bt.write_text("[Adapter]\nAddress = 11:22:33:44:55:66\nName = Galaxy A54\n\n"
                  "[00:1a:7d:00:00:02]\nName = Ecouteurs BT\n"
                  f"Timestamp = {_ms('2026-08-30T08:12:00') // 1000}\nLinkKey = 00112233445566778899aabbccddeeff\n",
                  encoding="utf-8")

    # usagestats au format XML historique : fichier nommé par le début d'intervalle (ms),
    # les attributs de temps sont des décalages relatifs à ce début.
    begin = _ms("2026-09-02T00:00:00")
    fg = _ms("2026-09-02T19:40:00") - begin
    us = data / "system/usagestats/0/daily" / str(begin)
    us.parent.mkdir(parents=True, exist_ok=True)
    us.write_text(
        "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<usagestats version=\"1\" endTime=\"86400000\">\n"
        f'<packages>\n<package lastTimeActive="{fg + 3000}" package="{SPY_PKG}" timeActive="3000" lastEvent="2" />\n'
        "</packages>\n<event-log>\n"
        f'<event time="{fg}" package="{SPY_PKG}" class="{SPY_PKG}.MainActivity" type="1" />\n'
        f'<event time="{fg + 3000}" package="{SPY_PKG}" class="{SPY_PKG}.MainActivity" type="2" />\n'
        "</event-log>\n</usagestats>\n", encoding="utf-8")

    _db(data / "data/com.android.browser/app_geolocation/CachedGeoposition.db",
        ["CREATE TABLE CachedPosition (latitude REAL, longitude REAL, altitude REAL, accuracy REAL,"
         " altitudeAccuracy REAL, heading REAL, speed REAL, timestamp INTEGER)"],
        [("INSERT INTO CachedPosition VALUES (?,?,?,?,?,?,?,?)",
          (11.7802, -0.3703, None, 12.0, None, None, None, _ms("2026-09-01T22:15:30")))])
    return root


if __name__ == "__main__":
    print(build_android_fs(sys.argv[1] if len(sys.argv) > 1 else "android_fs"))
