"""Parseurs natifs Veritrace (moteur veritrace-sqlite)."""
import io
import shutil
import sqlite3
import tarfile
import zipfile
from collections import Counter
from pathlib import Path

import pytest

from veritrace.core.hashing import sha256_tree
from veritrace.parsing.aleapp import normalize as aleapp_normalize
from veritrace.parsing.base import ArtifactBuilder, RunContext, ToolFailed
from veritrace.parsing.sqlite_native import (SqliteNativeWrapper, classify, dumpsys_section, parse_dumpsys_accessibility,
                                             parse_dumpsys_package)
from veritrace.schema.validator import fragment_errors

from fixtures.android_fs import DUMPSYS_ACCESSIBILITY, DUMPSYS_PACKAGE, SPY_PKG, build_android_fs, build_dumpsys

ALEAPP_OUT = Path(__file__).parent / "fixtures" / "aleapp_2026.4.2"


def _run(path, tmp_path):
    return SqliteNativeWrapper().run(path, tmp_path / "out", RunContext("RUN-T", "EV-001", {}))


def _facts(arts, cats=None):
    return {(a["category"], a["x_veritrace"]["fact_sha256"]) for a in arts if not cats or a["category"] in cats}


@pytest.fixture
def fs(tmp_path):
    return build_android_fs(tmp_path / "fs")


def test_classify():
    assert classify("data/data/com.android.providers.telephony/databases/mmssms.db") == "sms"
    assert classify("apps/com.android.providers.telephony/db/mmssms.db") == "sms"          # sauvegarde ADB
    assert classify("data/data/com.android.chrome/app_chrome/Default/History") == "browser"
    assert classify("data/media/0/DCIM/Camera/IMG_1.JPG") == "image"
    assert classify("data/media/0/Android/data/x/cache/img.jpg") is None                  # pas un dossier photo
    assert classify("acquisition/raw/ACQ-03/dumpsys_package.txt") == "dumpsys_package"
    assert classify("data/system/packages.xml") is None


def test_filesystem_extraction(fs, tmp_path):
    r = _run(fs, tmp_path)
    cats = Counter(a["category"] for a in r.artifacts)
    assert cats == {"sms": 2, "appel": 3, "contact": 1, "navigation": 1, "exif": 1, "localisation": 1}
    assert fragment_errors({"artifacts": r.artifacts}) == []       # format pivot
    assert all(a["source"]["tool"] == "veritrace-sqlite" for a in r.artifacts)
    sms = next(a for a in r.artifacts if a["category"] == "sms" and a["data"]["direction"] == "entrant")
    assert sms["source"]["file_path"] == "data/data/com.android.providers.telephony/databases/mmssms.db"
    assert sms["source"]["record_ref"] == "sms:_id=4471"


def test_same_facts_as_aleapp(fs, tmp_path):
    """Indépendance des moteurs : les faits communs ont la même empreinte qu'ALEAPP (→ corroboration)."""
    native = _run(fs, tmp_path).artifacts
    b = ArtifactBuilder("R", "E")
    aleapp_normalize(ALEAPP_OUT, b, {"name": "ALEAPP", "version": "2026.4.2"})
    common = {"sms", "appel", "contact", "navigation", "localisation"}
    assert _facts(native, common) == _facts(b.items, common)


def test_originals_untouched_and_wal_replayed(fs, tmp_path):
    db = fs / "data/data/com.android.providers.telephony/databases/mmssms.db"
    con = sqlite3.connect(db)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA wal_autocheckpoint=0")
    con.execute("INSERT INTO sms (_id, thread_id, address, date, read, type, body) VALUES "
                "(5000, 12, '+22670000001', 1788400000000, 0, 1, 'Message encore dans le WAL')")
    con.commit()
    wal = db.with_name(db.name + "-wal")
    assert wal.stat().st_size > 0
    before = sha256_tree(fs)
    r = _run(fs, tmp_path)
    # Empreinte recalculée AVANT de fermer la connexion du test (la fermeture déclenche un
    # checkpoint WAL qui, lui, réécrirait la base).
    assert sha256_tree(fs) == before   # extraction (base + WAL) inchangée par l'analyse
    con.close()
    assert any(a["data"].get("body") == "Message encore dans le WAL" for a in r.artifacts)
    assert any("WAL" in n for n in r.notes)


@pytest.mark.parametrize("fmt", ["tar", "zip"])
def test_archives(fs, tmp_path, fmt):
    arc = tmp_path / f"extraction.{fmt}"
    if fmt == "tar":
        with tarfile.open(arc, "w") as tf:
            tf.add(fs, arcname=".")
    else:
        with zipfile.ZipFile(arc, "w") as zf:
            for f in fs.rglob("*"):
                if f.is_file():
                    zf.write(f, f.relative_to(fs).as_posix())
    r = _run(arc, tmp_path)
    assert Counter(a["category"] for a in r.artifacts)["sms"] == 2


def test_adb_backup_tar_layout(fs, tmp_path):
    """Arborescence d'une sauvegarde ADB convertie : apps/<paquet>/db/<base>."""
    arc = tmp_path / "backup.tar"
    with tarfile.open(arc, "w") as tf:
        tf.add(fs / "data/data/com.android.providers.telephony/databases/mmssms.db",
               arcname="apps/com.android.providers.telephony/db/mmssms.db")
    r = _run(arc, tmp_path)
    assert {a["source"]["file_path"] for a in r.artifacts} == {"apps/com.android.providers.telephony/db/mmssms.db"}
    assert len(r.artifacts) == 2


def test_unsupported_input(tmp_path):
    f = tmp_path / "x.bin"
    f.write_bytes(b"\x00" * 10)
    with pytest.raises(ToolFailed):
        _run(f, tmp_path)


def test_exif_and_gps(fs, tmp_path):
    r = _run(fs, tmp_path)
    exif = next(a for a in r.artifacts if a["category"] == "exif")
    assert exif["data"]["make"] == "samsung" and exif["data"]["latitude"] == 11.7802
    assert exif["data"]["longitude"] == -0.3703 and exif["data"]["gps_timestamp"] == "2026-09-01T22:15:30+00:00"
    assert len(exif["data"]["file_sha256"]) == 64
    loc = next(a for a in r.artifacts if a["category"] == "localisation")
    assert loc["data"]["provider"] == "exif" and loc["timestamp"] == "2026-09-01T22:15:30+00:00"


def test_dumpsys_package_parser():
    apps = {a["package"]: a for a in parse_dumpsys_package(DUMPSYS_PACKAGE)}
    spy = apps[SPY_PKG]
    assert spy["installer"] is None and spy["is_system"] is False and spy["version_name"] == "4.2.1"
    assert "android.permission.READ_SMS" in spy["permissions"]
    assert "android.permission.CAMERA" not in spy["permissions"]          # granted=false
    assert apps["com.android.settings"]["is_system"] is True               # pkgFlags SYSTEM
    assert apps["com.whatsapp"]["installer"] == "com.android.vending"


def test_dumpsys_accessibility_and_global_dump():
    assert parse_dumpsys_accessibility(DUMPSYS_ACCESSIBILITY) == {SPY_PKG}
    combined = ("DUMP OF SERVICE accessibility:\n" + DUMPSYS_ACCESSIBILITY + "-" * 20 + "\n"
                "DUMP OF SERVICE package:\n" + DUMPSYS_PACKAGE)
    assert parse_dumpsys_accessibility(dumpsys_section(combined, "accessibility")) == {SPY_PKG}
    assert len(parse_dumpsys_package(dumpsys_section(combined, "package"))) == 3


def test_dumpsys_directory(tmp_path):
    r = _run(build_dumpsys(tmp_path / "ds"), tmp_path)
    apps = {a["data"]["package"]: a["data"] for a in r.artifacts}
    assert apps[SPY_PKG]["accessibility_service_enabled"] is True
    assert apps["com.whatsapp"]["accessibility_service_enabled"] is False


def test_rules_use_enabled_accessibility(tmp_path):
    """R1 mentionne le service d'accessibilité ACTIVÉ lu par le moteur natif."""
    import json
    from click.testing import CliRunner
    from veritrace.cli import cli
    from conftest import AUTH_INPUT

    runner = CliRunner()
    case = tmp_path / "VT-S"
    runner.invoke(cli, ["case", "init", str(case), "--case-id", "VT-S", "--title", "t", "--org-name", "o"], input=AUTH_INPUT)
    r = runner.invoke(cli, ["parse", "sqlite", "--case", str(case), "--input", str(build_dumpsys(tmp_path / "ds"))],
                      input=AUTH_INPUT)
    assert r.exit_code == 0 and "succes" in r.output, r.output
    doc = json.loads((case / "normalized/veritrace_case.json").read_text(encoding="utf-8"))
    r1 = [f for f in doc["findings"] if f["x_veritrace"].get("rule_id") == "R1"]
    assert len(r1) == 1 and SPY_PKG in r1[0]["title"] and "accessibilité ACTIVÉ" in r1[0]["description"]
