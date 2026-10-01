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


def _jpeg_with_exif(path: Path) -> None:
    """Photo avec EXIF (appareil, date locale + décalage) et GPS (heure UTC), si Pillow est disponible."""
    try:
        from PIL import Image
        from PIL.TiffImagePlugin import IFDRational as Q
    except ImportError:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (64, 48), (90, 120, 160))
    exif = img.getexif()
    exif[271], exif[272] = "samsung", "SM-A546B"                       # Make, Model
    sub = exif.get_ifd(0x8769)
    sub[36867] = "2026:09:01 22:15:30"                                 # DateTimeOriginal (heure locale)
    sub[36881] = "+00:00"                                              # OffsetTimeOriginal
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2] = "N", (Q(11, 1), Q(46, 1), Q(4872, 100))          # 11.7802 N
    gps[3], gps[4] = "W", (Q(0, 1), Q(22, 1), Q(1308, 100))           # 0.3703 W
    gps[7], gps[29] = (Q(22, 1), Q(15, 1), Q(30, 1)), "2026:09:01"    # GPSTimeStamp / GPSDateStamp (UTC)
    img.save(path, exif=exif)


DUMPSYS_PACKAGE = """\
Packages:
  Package [com.sys.monitor.service] (a1b2c3d):
    userId=10245
    pkg=Package{d4e5f6 com.sys.monitor.service}
    codePath=/data/app/~~x/com.sys.monitor.service-1
    versionCode=421 minSdk=24 targetSdk=29
    versionName=4.2.1
    pkgFlags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ]
    timeStamp=2026-08-14 21:03:11
    firstInstallTime=2026-08-14 21:03:11
    lastUpdateTime=2026-08-14 21:03:11
    installerPackageName=null
    requested permissions:
      android.permission.READ_SMS
      android.permission.INTERNET
    install permissions:
      android.permission.INTERNET: granted=true
      android.permission.RECEIVE_BOOT_COMPLETED: granted=true
    User 0: ceDataInode=1234 installed=true hidden=false suspended=false stopped=false notLaunched=false enabled=0
      runtime permissions:
        android.permission.READ_SMS: granted=true, flags=[ USER_SET ]
        android.permission.ACCESS_FINE_LOCATION: granted=true, flags=[ USER_SET ]
        android.permission.RECORD_AUDIO: granted=true, flags=[ USER_SET ]
        android.permission.CAMERA: granted=false, flags=[ USER_SET ]
  Package [com.whatsapp] (e7f8a9b):
    userId=10150
    codePath=/data/app/~~y/com.whatsapp-1
    versionName=2.26.18.75
    pkgFlags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ]
    firstInstallTime=2025-01-10 10:00:00
    installerPackageName=com.android.vending
    User 0: ceDataInode=5678 installed=true hidden=false
      runtime permissions:
        android.permission.RECORD_AUDIO: granted=true, flags=[ USER_SET ]
  Package [com.android.settings] (c0d1e2f):
    userId=1000
    codePath=/system/priv-app/Settings
    versionName=14
    pkgFlags=[ SYSTEM HAS_CODE PERSISTENT ]
    installerPackageName=null
"""

DUMPSYS_ACCESSIBILITY = """\
ACCESSIBILITY MANAGER (dumpsys accessibility)

currentUserId=0
User state[
  attributes:{id=0, touchExplorationEnabled=false, serviceHandlesDoubleTap=false}
     Bound services:{Service[label=System Service, feedbackType[FEEDBACK_GENERIC], capabilities=1, eventTypes=TYPES_ALL_MASK, notificationTimeout=0, requestA11yBtn=false]}
     Enabled services:{{com.sys.monitor.service/com.sys.monitor.service.AccessService}}
     Binding services:{}
]
"""


def build_dumpsys(root: str | Path) -> Path:
    """Sorties `dumpsys package` / `dumpsys accessibility` telles que collectées par `veritrace acquire`."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    (root / "dumpsys_package.txt").write_text(DUMPSYS_PACKAGE, encoding="utf-8")
    (root / "dumpsys_accessibility.txt").write_text(DUMPSYS_ACCESSIBILITY, encoding="utf-8")
    return root


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
          (903, _ms("2026-09-03T08:15:00"), None, "+22670000002", 2, 125, None, "BF", None, None, None, 0)),
         # horodatage dans le futur (horloge modifiée) : doit déclencher la règle R4
         ("INSERT INTO calls VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          (904, _ms("2031-01-01T12:00:00"), None, "+22670000003", 1, 30, None, "BF", None, None, None, 0))])

    _db(data / "data/com.android.providers.contacts/databases/contacts2.db",
        ["CREATE TABLE contacts (_id INTEGER PRIMARY KEY, name_raw_contact_id INTEGER)",
         "CREATE TABLE raw_contacts (_id INTEGER PRIMARY KEY, contact_id INTEGER, display_name TEXT, deleted INTEGER)",
         "CREATE TABLE mimetypes (_id INTEGER PRIMARY KEY, mimetype TEXT)",
         "CREATE TABLE data (_id INTEGER PRIMARY KEY, raw_contact_id INTEGER, mimetype_id INTEGER, data1 TEXT)"],
        [("INSERT INTO mimetypes VALUES (?,?)", (5, "vnd.android.cursor.item/phone_v2")),
         ("INSERT INTO mimetypes VALUES (?,?)", (1, "vnd.android.cursor.item/email_v2")),
         ("INSERT INTO mimetypes VALUES (?,?)", (7, "vnd.android.cursor.item/name")),
         ("INSERT INTO contacts VALUES (?,?)", (1, 55)),
         ("INSERT INTO raw_contacts VALUES (?,?,?,?)", (55, 1, "Contact A", 0)),
         ("INSERT INTO data VALUES (?,?,?,?)", (1, 55, 7, "Contact A")),
         ("INSERT INTO data VALUES (?,?,?,?)", (2, 55, 5, "+22670000001")),
         ("INSERT INTO data VALUES (?,?,?,?)", (3, 55, 1, "contact.a@example.invalid"))])

    _jpeg_with_exif(data / "media/0/DCIM/Camera/IMG_20260901_221530.jpg")

    from tests.fixtures.messaging import build_messaging  # messageries tierces
    build_messaging(data)

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
        # application système sans installateur : ne doit PAS être signalée comme sideload
        f'  <package name="com.android.settings" codePath="/system/priv-app/Settings" ft="{it2}" it="{it2}"'
        f' ut="{it2}" version="34" userId="1000" />\n'
        "</packages>\n", encoding="utf-8")

    # Permissions d'exécution (Android 10+)
    rp = data / "system/users/0/runtime-permissions.xml"
    rp.parent.mkdir(parents=True, exist_ok=True)
    perms = ["READ_SMS", "RECEIVE_SMS", "ACCESS_FINE_LOCATION", "ACCESS_BACKGROUND_LOCATION", "RECORD_AUDIO",
             "READ_CALL_LOG"]
    rp.write_text(
        "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<runtime-permissions version=\"10\">\n"
        f'<pkg name="{SPY_PKG}">\n'
        + "".join(f'<item name="android.permission.{x}" granted="true" flags="0" />\n' for x in perms)
        + "</pkg>\n<pkg name=\"com.whatsapp\">\n"
        '<item name="android.permission.RECORD_AUDIO" granted="true" flags="0" />\n'
        '<item name="android.permission.CAMERA" granted="false" flags="0" />\n'
        "</pkg>\n</runtime-permissions>\n", encoding="utf-8")

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
