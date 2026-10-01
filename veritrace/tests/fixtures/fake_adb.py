"""Faux `adb` pour les tests (aucun appareil réel). Comportement piloté par variables :

FAKE_ADB_DEVICES : device (défaut) | unauthorized | none | two
FAKE_ADB_BACKUP  : ok (défaut) | refuse | encrypted
FAKE_ADB_LOG     : fichier où chaque invocation est consignée (contrôle des commandes émises)
"""
from __future__ import annotations

import io
import os
import sys
import tarfile
import zipfile
import zlib
from pathlib import Path

SERIAL = "R5CW0000000"
PROPS = {
    "ro.product.manufacturer": "samsung", "ro.product.model": "SM-A546B", "ro.product.brand": "samsung",
    "ro.build.version.release": "14", "ro.build.version.sdk": "34", "ro.build.version.security_patch": "2026-07-01",
    "ro.build.fingerprint": "samsung/a54xnseea/a54x:14/UP1A.231005.007/A546BXXS8BXF1:user/release-keys",
    "ro.serialno": SERIAL,
}


def _tar_bytes() -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tf:
        data = b"SQLite format 3\x00" + b"\x00" * 84
        info = tarfile.TarInfo("apps/com.android.providers.telephony/db/mmssms.db")
        info.size = len(data)
        tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def main(argv: list[str]) -> int:
    if os.environ.get("FAKE_ADB_LOG"):
        with open(os.environ["FAKE_ADB_LOG"], "a") as fh:
            fh.write(" ".join(argv) + "\n")
    if argv[:1] == ["-s"]:
        argv = argv[2:]
    mode = os.environ.get("FAKE_ADB_DEVICES", "device")
    if argv[:1] == ["version"]:
        print("Android Debug Bridge version 1.0.41\nVersion 35.0.2-12147458\nInstalled as /fake/adb")
        return 0
    if argv[:1] == ["devices"]:
        print("List of devices attached")
        if mode == "device":
            print(f"{SERIAL}             device usb:1-1 product:a54xnseea model:SM_A546B device:a54x transport_id:1")
        elif mode == "unauthorized":
            print(f"{SERIAL}             unauthorized usb:1-1 transport_id:1")
        elif mode == "two":
            print(f"{SERIAL}             device usb:1-1 transport_id:1")
            print("emulator-5554          device product:sdk model:sdk transport_id:2")
        print()
        return 0
    if argv[:2] == ["shell", "getprop"]:
        for k, v in PROPS.items():
            print(f"[{k}]: [{v}]")
        return 0
    if argv[:3] == ["shell", "pm", "list"]:
        print("package:/data/app/~~x/com.sys.monitor.service-1/base.apk=com.sys.monitor.service  installer=null uid:10245")
        print("package:/data/app/~~y/com.whatsapp-1/base.apk=com.whatsapp  installer=com.android.vending uid:10150")
        return 0
    if argv[:2] == ["shell", "dumpsys"]:
        if argv[2] == "bluetooth_manager":
            print("Can't find service: bluetooth_manager", file=sys.stderr)
            return 0
        print(f"DUMP OF SERVICE {argv[2]}:\n  (sortie simulée)")
        return 0
    if argv[:3] == ["shell", "ls", "-d"]:
        if argv[3] in ("/sdcard/DCIM", "/sdcard/Download"):
            print(argv[3])
            return 0
        print(f"ls: {argv[3]}: No such file or directory", file=sys.stderr)
        return 1
    if argv[:1] == ["pull"]:
        remote, dest = argv[-2], Path(argv[-1])
        dest.mkdir(parents=True)
        (dest / "Camera").mkdir()
        (dest / "Camera" / "IMG_20260901_221530.jpg").write_bytes(b"\xff\xd8\xff\xe0 fausse image " + remote.encode())
        (dest / "note.txt").write_text("contenu simulé")
        return 0
    if argv[:1] == ["backup"]:
        out = Path(argv[argv.index("-f") + 1])
        behaviour = os.environ.get("FAKE_ADB_BACKUP", "ok")
        if behaviour == "refuse":
            out.write_bytes(b"")
        elif behaviour == "encrypted":
            out.write_bytes(b"ANDROID BACKUP\n5\n1\nAES-256\n" + os.urandom(256))
        else:
            out.write_bytes(b"ANDROID BACKUP\n5\n1\nnone\n" + zlib.compress(_tar_bytes()))
        return 0
    if argv[:1] == ["bugreport"]:
        d = Path(argv[1])
        with zipfile.ZipFile(d / "bugreport-a54x-UP1A-2026-10-01-10-00-00.zip", "w") as z:
            z.writestr("bugreport-a54x-UP1A-2026-10-01-10-00-00.txt", "== dumpstate ==\n")
            z.writestr("dumpstate_board.txt", "board\n")
        return 0
    print(f"fake adb: commande non simulée : {' '.join(argv)}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
