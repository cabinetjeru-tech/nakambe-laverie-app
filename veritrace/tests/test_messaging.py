"""Messageries tierces : WhatsApp, Viber, Messenger (natif + ALEAPP), Telegram (ALEAPP), Signal (détection)."""
import json
import sqlite3
from collections import Counter
from pathlib import Path

from click.testing import CliRunner

from veritrace.cli import cli
from veritrace.parsing.aleapp import normalize as aleapp_normalize
from veritrace.parsing.base import ArtifactBuilder, RunContext
from veritrace.parsing.sqlite_native import SqliteNativeWrapper, classify
from veritrace.schema import validate
from veritrace.schema.validator import fragment_errors

from conftest import AUTH_INPUT
from fixtures.android_fs import build_android_fs

ALEAPP_OUT = Path(__file__).parent / "fixtures" / "aleapp_2026.4.2"


def _native(tmp_path):
    fs = build_android_fs(tmp_path / "fs")
    return fs, SqliteNativeWrapper().run(fs, tmp_path / "out", RunContext("RUN-T", "EV-001", {}))


def _aleapp():
    b = ArtifactBuilder("R", "E")
    aleapp_normalize(ALEAPP_OUT, b, {"name": "ALEAPP", "version": "2026.4.2"})
    return b.items


def _msgs(arts, app=None):
    return [a for a in arts if a["category"] == "message" and (app is None or a["data"]["app"] == app)]


def test_classify_messaging():
    assert classify("data/data/com.whatsapp/databases/msgstore.db") == "whatsapp"
    assert classify("data/data/com.whatsapp.w4b/databases/msgstore.db") == "whatsapp"
    assert classify("data/data/com.whatsapp/databases/wa.db") == "whatsapp_contacts"
    assert classify("media/0/WhatsApp/Databases/msgstore-2026-09-01.1.db.crypt15") == "whatsapp_crypt"
    assert classify("data/data/com.viber.voip/databases/viber_messages") == "viber_messages"
    assert classify("data/data/com.facebook.orca/databases/threads_db2") == "messenger"
    assert classify("data/data/org.thoughtcrime.securesms/databases/signal.db") == "signal"


def test_native_whatsapp(tmp_path):
    _, r = _native(tmp_path)
    wa = {a["timestamp"]: a["data"] for a in _msgs(r.artifacts, "WhatsApp")}
    assert len(wa) == 4
    assert wa["2026-09-02T19:30:00+00:00"]["sender_name"] == "Contact A"
    assert wa["2026-09-02T19:31:10+00:00"]["direction"] == "sortant"
    img = wa["2026-09-02T19:35:00+00:00"]
    assert img["message_type"] == "image" and img["attachment"].endswith("IMG-20260902-WA0001.jpg")
    grp = wa["2026-09-03T07:45:00+00:00"]
    assert grp["is_group"] and grp["conversation"] == "Famille" and grp["sender_name"] == "Contact D"
    call = next(a for a in r.artifacts if a["category"] == "appel" and a["data"].get("app") == "WhatsApp")
    assert call["data"] == {"app": "WhatsApp", "direction": "entrant", "number": "+22670000001",
                            "contact_name": "Contact A", "duration_s": 42, "call_type": "video"}
    assert fragment_errors({"artifacts": r.artifacts}) == []


def test_native_and_aleapp_agree_per_app(tmp_path):
    """Indépendance : pour WhatsApp, Viber et Messenger, les deux moteurs décrivent les mêmes faits."""
    _, r = _native(tmp_path)
    aleapp = _aleapp()
    for app in ("WhatsApp", "Viber", "Facebook Messenger"):
        native = {a["x_veritrace"]["fact_sha256"] for a in _msgs(r.artifacts, app)}
        other = {a["x_veritrace"]["fact_sha256"] for a in _msgs(aleapp, app)}
        assert native and native == other, app


def test_telegram_via_aleapp():
    tg = _msgs(_aleapp(), "Telegram")
    assert len(tg) == 1
    assert tg[0]["data"]["body"] == "Je te surveille." and tg[0]["data"]["direction"] == "entrant"
    assert tg[0]["timestamp"] == "2026-09-02T22:00:00+00:00"


def test_unreadable_stores_become_limitations(tmp_path):
    _, r = _native(tmp_path)
    text = " ".join(r.limitations)
    assert "Signal" in text and "chiffrée" in text and "aucun déchiffrement" in text
    assert ".crypt14" in text
    assert not _msgs(r.artifacts, "Signal")


def test_legacy_whatsapp_schema(tmp_path):
    db = tmp_path / "x" / "data/data/com.whatsapp/databases/msgstore.db"
    db.parent.mkdir(parents=True)
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE messages (_id INTEGER PRIMARY KEY, key_remote_jid TEXT, key_from_me INTEGER, "
                "data TEXT, timestamp INTEGER, media_name TEXT, remote_resource TEXT, latitude REAL, longitude REAL)")
    con.execute("INSERT INTO messages VALUES (1, '22670000005@s.whatsapp.net', 0, 'Ancien format', 1500000000000,"
                " NULL, NULL, 0, 0)")
    con.execute("INSERT INTO messages VALUES (2, '-1', 0, NULL, 0, NULL, NULL, 0, 0)")   # ligne technique
    con.commit()
    con.close()
    r = SqliteNativeWrapper().run(tmp_path / "x", tmp_path / "out", RunContext("R", "E", {}))
    msgs = _msgs(r.artifacts, "WhatsApp")
    assert [m["data"]["body"] for m in msgs] == ["Ancien format"]
    assert msgs[0]["timestamp"] == "2017-07-14T02:40:00+00:00"


def test_end_to_end_messaging(tmp_path):
    runner = CliRunner()
    case = tmp_path / "VT-M"
    fs = build_android_fs(tmp_path / "fs")
    runner.invoke(cli, ["case", "init", str(case), "--case-id", "VT-M", "--title", "t", "--org-name", "o"],
                  input=AUTH_INPUT)
    for args in (["parse", "aleapp", "--case", str(case), "--input", str(fs), "--from-output", str(ALEAPP_OUT)],
                 ["parse", "sqlite", "--case", str(case), "--input", str(fs)]):
        r = runner.invoke(cli, args, input=AUTH_INPUT)
        assert r.exit_code == 0, r.output
    doc = json.loads((case / "normalized/veritrace_case.json").read_text(encoding="utf-8"))
    assert validate(doc).ok
    msgs = _msgs(doc["artifacts"])
    corr = Counter(a["data"]["app"] for a in msgs if a["corroborated"])
    assert corr == {"WhatsApp": 8, "Viber": 4, "Facebook Messenger": 2}       # 2 moteurs par message
    assert not any(a["corroborated"] for a in _msgs(doc["artifacts"], "Telegram"))
    events = [t for t in doc["timeline"] if t["category"] == "message"]
    assert len(events) == 8                                                     # un événement par message
    lims = doc["case"]["x_veritrace"]["limitations"]
    assert any("Signal" in l for l in lims) and any(".crypt14" in l for l in lims)

    r = runner.invoke(cli, ["report", "--case", str(case), "--report", "judiciaire", "--format", "md"], input=AUTH_INPUT)
    md = next((case / "reports").glob("*.md")).read_text(encoding="utf-8")
    assert "Messageries tierces" in md and "Telegram — message reçu de" in md and "SQLCipher" in md
