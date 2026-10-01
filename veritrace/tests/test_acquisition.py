"""Acquisition ADB — testée avec un faux adb (fixtures/fake_adb.py), aucun appareil réel."""
import json
import os
import stat
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest
from click.testing import CliRunner

from veritrace.acquisition.adb import Adb, AdbError, parse_devices, parse_getprop
from veritrace.acquisition.backup import BackupEncrypted, ab_to_tar
from veritrace.cli import cli
from veritrace.core.audit import AuditLog
from veritrace.core.hashing import sha256_file
from veritrace.schema import validate

from conftest import AUTH_INPUT

FAKE = Path(__file__).parent / "fixtures" / "fake_adb.py"
CONFIRM = AUTH_INPUT + "o\n"


@pytest.fixture
def fake_adb(tmp_path, monkeypatch):
    launcher = tmp_path / "bin" / "adb"
    launcher.parent.mkdir()
    launcher.write_text(f"#!/bin/sh\nexec {sys.executable} {FAKE} \"$@\"\n")
    launcher.chmod(0o755)
    log = tmp_path / "adb_calls.log"
    monkeypatch.setenv("VERITRACE_ADB", str(launcher))
    monkeypatch.setenv("FAKE_ADB_LOG", str(log))
    return launcher, log


@pytest.fixture
def case(tmp_path):
    d = tmp_path / "VT-ACQ"
    r = CliRunner().invoke(cli, ["case", "init", str(d), "--case-id", "VT-ACQ", "--title", "Acquisition",
                                 "--org-name", "Cabinet"], input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    return d


def _doc(case):
    return json.loads((case / "normalized" / "veritrace_case.json").read_text(encoding="utf-8"))


def test_parsers():
    devs = parse_devices("List of devices attached\nABC device usb:1 model:Pixel_8 transport_id:3\n"
                         "XYZ unauthorized usb:2\nQQQ no permissions (user in plugdev group); see [http://x]\n")
    assert [(d.serial, d.state) for d in devs] == [("ABC", "device"), ("XYZ", "unauthorized"), ("QQQ", "no permissions")]
    assert devs[0].attrs["model"] == "Pixel_8" and not devs[1].ready and "Autoriser" in devs[1].help
    assert parse_getprop("[ro.a]: [1]\n[ro.b]: []\n") == {"ro.a": "1", "ro.b": ""}


def test_forbidden_commands_never_reach_adb(fake_adb):
    launcher, log = fake_adb
    adb = Adb(str(launcher))
    for args in (("shell", "su", "-c", "id"), ("shell", "input", "keyevent", "82"), ("root",),
                 ("shell", "locksettings", "clear")):
        with pytest.raises(AdbError, match="garde-fou"):
            adb.run(*args)
    assert not log.exists()                      # aucune de ces commandes n'a été émise
    assert adb.exists("/sdcard/root") is False  # un CHEMIN contenant « root » reste permis


def test_ab_to_tar_and_encrypted(tmp_path):
    import zlib, io
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tf:
        info = tarfile.TarInfo("apps/x/f.txt"); info.size = 2; tf.addfile(info, io.BytesIO(b"hi"))
    ab = tmp_path / "b.ab"
    ab.write_bytes(b"ANDROID BACKUP\n5\n1\nnone\n" + zlib.compress(buf.getvalue()))
    assert ab_to_tar(ab, tmp_path / "b.tar") == 1
    enc = tmp_path / "e.ab"
    enc.write_bytes(b"ANDROID BACKUP\n5\n1\nAES-256\n" + b"x" * 64)
    with pytest.raises(BackupEncrypted):
        ab_to_tar(enc, tmp_path / "e.tar")


def test_full_acquisition(fake_adb, case):
    _, log = fake_adb
    r = CliRunner().invoke(cli, ["acquire", "run", "--case", str(case), "--method", "packages", "--method", "dumpsys",
                                 "--method", "backup", "--method", "pull", "--method", "bugreport",
                                 "--imei", "350000000000001", "--seal", "SC-1", "--owner", "Titulaire"], input=CONFIRM)
    assert r.exit_code == 0, r.output
    doc = _doc(case)
    assert validate(doc, case_root=case).ok, validate(doc, case_root=case).errors   # ré-hachage sur disque

    dev = doc["devices"][0]
    assert (dev["manufacturer"], dev["model"], dev["android_version"], dev["serial"]) == ("samsung", "SM-A546B", "14", "R5CW0000000")
    assert dev["imei"] == ["350000000000001"] and dev["seal_number"] == "SC-1"

    methods = {a["method"]: a for a in doc["acquisitions"]}
    assert set(methods) == {"adb_getprop", "adb_package_list", "adb_dumpsys", "adb_backup", "adb_pull", "adb_bugreport"}
    assert methods["adb_dumpsys"]["status"] == "partial"          # bluetooth_manager indisponible
    assert methods["adb_pull"]["status"] == "partial"             # 2 chemins absents sur 4
    assert "Android 12" in methods["adb_backup"]["notes"]         # avertissement SDK 34

    # Chaque preuve : hachée, en lecture seule, avec un événement de custody « collected »
    collected = {c["evidence_id"]: c for c in doc["custody_chain"] if c["action"] == "collected"}
    for ev in doc["evidence_items"]:
        assert ev["evidence_id"] in collected and collected[ev["evidence_id"]]["sha256"] == ev["sha256"]
        assert collected[ev["evidence_id"]]["actor"] == "Examinateur Test"
        p = case / ev["local_path"]
        files = [p] if p.is_file() else [f for f in p.rglob("*") if f.is_file()]
        assert all(not (f.stat().st_mode & stat.S_IWUSR) for f in files)
    labels = " | ".join(e["label"] for e in doc["evidence_items"])
    assert "backup.ab" in labels and "tar (dérivée de" in labels and "Journal des commandes ADB" in labels
    tar_ev = next(e for e in doc["evidence_items"] if e["local_path"].endswith("backup.tar"))
    assert tarfile.open(case / tar_ev["local_path"]).getnames() == ["apps/com.android.providers.telephony/db/mmssms.db"]

    # Le manifeste d'un dossier copié est vérifiable avec sha256sum -c
    pull_ev = next(e for e in doc["evidence_items"] if e["device_path"] == "/sdcard/DCIM")
    manifest = case / "custody" / "manifests" / f"{pull_ev['evidence_id']}.sha256sum"
    out = subprocess.run(["sha256sum", "-c", str(manifest)], cwd=case / pull_ev["local_path"], capture_output=True, text=True)
    assert out.returncode == 0 and "OK" in out.stdout

    calls = log.read_text()
    assert "-s R5CW0000000 shell getprop" in calls
    assert not any(w in calls.split() for w in ("su", "input", "root"))
    actions = [e["action"] for e in AuditLog(case / "audit" / "audit.jsonl").entries()]
    assert "device_confirmed" in actions and actions.count("acquisition_step") == 6


def test_report_shows_device_and_acquisitions(fake_adb, case):
    CliRunner().invoke(cli, ["acquire", "run", "--case", str(case), "--method", "packages",
                             "--imei", "350000000000001"], input=CONFIRM)
    r = CliRunner().invoke(cli, ["report", "--case", str(case), "--report", "judiciaire", "--format", "md"],
                           input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    md = next((case / "reports").glob("*.md")).read_text(encoding="utf-8")
    assert "SM-A546B" in md and "350000000000001" in md and "Liste des applications (adb shell pm list packages)" in md


@pytest.mark.parametrize("mode,expected", [("unauthorized", "Autoriser le débogage USB"),
                                           ("none", "Aucun appareil"), ("two", "--serial")])
def test_device_not_ready_is_refused(fake_adb, case, monkeypatch, mode, expected):
    monkeypatch.setenv("FAKE_ADB_DEVICES", mode)
    r = CliRunner().invoke(cli, ["acquire", "run", "--case", str(case)], input=CONFIRM)
    assert r.exit_code != 0 and expected in r.output
    assert _doc(case)["acquisitions"] == []
    assert "acquisition_refused" in [e["action"] for e in AuditLog(case / "audit" / "audit.jsonl").entries()]


def test_examiner_must_confirm_device(fake_adb, case):
    r = CliRunner().invoke(cli, ["acquire", "run", "--case", str(case)], input=AUTH_INPUT + "n\n")
    assert r.exit_code != 0 and "annulée" in r.output
    assert _doc(case)["acquisitions"] == [] and _doc(case)["devices"] == []


@pytest.mark.parametrize("behaviour,status,note", [("refuse", "failed", "refusée"), ("encrypted", "partial", "chiffrée")])
def test_backup_refused_or_encrypted(fake_adb, case, monkeypatch, behaviour, status, note):
    monkeypatch.setenv("FAKE_ADB_BACKUP", behaviour)
    r = CliRunner().invoke(cli, ["acquire", "run", "--case", str(case), "--method", "backup"], input=CONFIRM)
    assert r.exit_code == 0, r.output
    acq = next(a for a in _doc(case)["acquisitions"] if a["method"] == "adb_backup")
    assert acq["status"] == status and note in acq["notes"]
    assert validate(_doc(case)).ok


def test_missing_adb_is_warning(tmp_path, case, monkeypatch):
    monkeypatch.delenv("VERITRACE_ADB", raising=False)
    monkeypatch.setenv("PATH", str(tmp_path / "vide"))
    r = CliRunner().invoke(cli, ["acquire", "run", "--case", str(case)], input=AUTH_INPUT)
    assert r.exit_code == 1 and "introuvable" in r.output and "Traceback" not in r.output


def test_acquisition_feeds_mvt_backup_mode(fake_adb, case):
    from veritrace.parsing.mvt import detect_mode

    CliRunner().invoke(cli, ["acquire", "run", "--case", str(case), "--method", "backup", "--method", "bugreport"],
                       input=CONFIRM)
    doc = _doc(case)
    ab = next(e for e in doc["evidence_items"] if e["local_path"].endswith("backup.ab"))
    br = next(e for e in doc["evidence_items"] if e["local_path"].endswith(".zip"))
    assert detect_mode(case / ab["local_path"]) == "backup"
    assert detect_mode(case / br["local_path"]) == "bugreport"
