"""Récupération des enregistrements supprimés (moteur veritrace-recover)."""
import json
import os
import random
import sqlite3
import tarfile
from collections import Counter

import pytest
from click.testing import CliRunner

from veritrace.cli import cli
from veritrace.core.hashing import sha256_tree
from veritrace.parsing.base import RunContext
from veritrace.parsing.recover import RecoverWrapper
from veritrace.parsing.sqlite_native import SqliteNativeWrapper
from veritrace.recovery.carver import Carver, TableSpec
from veritrace.recovery.sqlite_format import FormatError, load_image, local_payload, varint
from veritrace.schema import validate
from veritrace.schema.validator import fragment_errors

from conftest import AUTH_INPUT
from fixtures import deleted as D

SMS_DB = "data/data/com.android.providers.telephony/databases/mmssms.db"


@pytest.fixture
def fs(tmp_path):
    return D.build_deleted_fs(tmp_path / "fs")


def _run(path, tmp_path):
    return RecoverWrapper().run(path, tmp_path / "out", RunContext("RUN-REC", "EV-001", {}))


def _rec(a):
    return a["x_veritrace"]["recovery"]


def _by_text(arts, text):
    return [a for a in arts if text in (a["data"].get("body") or a["data"].get("url") or "")]


# --------------------------------------------------------------------------- format
def test_varint_and_local_payload():
    assert varint(b"\x05", 0) == (5, 1)
    assert varint(b"\x81\x00", 0) == (128, 2)
    assert varint(b"\xff" * 8 + b"\x01", 0) == ((((1 << 56) - 1) << 8) | 1, 9)   # 9e octet : 8 bits
    with pytest.raises(FormatError):
        varint(b"\x81", 0)
    assert local_payload(100, 4096) == 100                 # tient dans la page
    assert local_payload(10_000, 4096) < 4096 - 35         # débordement


def test_non_sqlite_file_is_rejected(tmp_path):
    f = tmp_path / "x.db"
    f.write_bytes(b"\x00" * 4096)
    with pytest.raises(FormatError):
        load_image(f)


# --------------------------------------------------------------------------- récupération
def test_deleted_sms_from_freeblocks(fs, tmp_path):
    r = _run(fs, tmp_path)
    sms = [a for a in r.artifacts if a["category"] == "sms"]
    assert sorted(a["data"]["body"] for a in sms) == sorted(D.SMS_DELETED)
    for a in sms:
        assert _rec(a)["status"] == "absent" and _rec(a)["method"] == "bloc_libre"
        assert _rec(a)["database"] == SMS_DB and _rec(a)["table"] == "sms"
        assert a["data"]["address"] == "+22670000002" and a["timestamp"].startswith("2026-09-1")
    # Un SMS simplement passé à « lu » laisse une ancienne cellule : ce n'est PAS une suppression.
    assert not _by_text(r.artifacts, D.SMS_READ_ONLY)


def test_whatsapp_deleted_and_edited_from_wal(fs, tmp_path):
    r = _run(fs, tmp_path)
    deleted, = _by_text(r.artifacts, D.WA_DELETED)
    assert _rec(deleted) | {"locations": None} == {
        "status": "absent", "method": "wal", "confidence": "elevee", "database": "data/data/com.whatsapp/databases/msgstore.db",
        "table": "message", "rowid": 3, "truncated": False, "locations": None}
    assert deleted["data"]["app"] == "WhatsApp" and deleted["data"]["conversation"] == "22670000002@s.whatsapp.net"
    before, = _by_text(r.artifacts, D.WA_EDITED_BEFORE)
    assert _rec(before)["status"] == "version_anterieure" and _rec(before)["rowid"] == 2
    assert not _by_text(r.artifacts, D.WA_EDITED_AFTER)       # contenu actuel : donnée active, pas récupérée


def test_url_from_persisted_rollback_journal(fs, tmp_path):
    r = _run(fs, tmp_path)
    url, = _by_text(r.artifacts, D.URL_DELETED)
    assert _rec(url)["method"] == "journal" and _rec(url)["confidence"] == "elevee"
    assert url["data"]["browser"] == "Chrome" and _rec(url)["rowid"] == 2
    assert len(_rec(url)["locations"]) == 2                   # aussi présent dans un bloc libre
    stats = {s["database"]: s for s in r.recovery_stats}
    assert stats["data/data/com.android.chrome/app_chrome/Default/History"]["journal"] == "remis_a_zero"


def test_calls_from_free_pages_without_false_positive(fs, tmp_path):
    r = _run(fs, tmp_path)
    calls = [a for a in r.artifacts if a["category"] == "appel"]
    ids = {int(a["data"]["number"][-2:]) for a in calls}
    assert len(calls) == len(ids) >= 40                       # pas de doublon
    assert ids <= set(range(21, 91))                          # uniquement des appels réellement supprimés
    assert {"page_libre", "espace_non_alloue"} <= {_rec(a)["method"] for a in calls}
    assert D.CALL_DELETED_NUMBER in {a["data"]["number"] for a in calls}


def test_secure_delete_is_reported_not_guessed(fs, tmp_path):
    r = _run(fs, tmp_path)
    stats = {s["database"]: s for s in r.recovery_stats}
    viber = stats["data/data/com.viber.voip/databases/viber_messages"]
    assert viber["secure_delete_observed"] and viber["recovered_absent"] == 0
    assert not [a for a in r.artifacts if a["data"].get("app") == "Viber"]
    assert any("viber_messages" in l and "effacement sécurisé" in l for l in r.limitations)


def test_pivot_format_and_no_alteration(fs, tmp_path):
    before = sha256_tree(fs)
    r = _run(fs, tmp_path)
    assert sha256_tree(fs) == before                           # originaux (base + WAL + journal) intacts
    assert fragment_errors({"artifacts": r.artifacts}) == []
    assert all(a["source"]["tool"] == "veritrace-recover" and "recupere" in a["x_veritrace"]["tags"]
               for a in r.artifacts)


def test_active_data_untouched_by_native_parser(fs, tmp_path):
    """Contrôle : le moteur des données actives ne voit aucun des enregistrements supprimés."""
    live = SqliteNativeWrapper().run(fs, tmp_path / "live", RunContext("R", "E", {})).artifacts
    texts = {a["data"].get("body") or a["data"].get("url") for a in live}
    assert not texts & {*D.SMS_DELETED, D.WA_DELETED, D.WA_EDITED_BEFORE, D.URL_DELETED}
    assert D.WA_EDITED_AFTER in texts


def test_archive_input(fs, tmp_path):
    tar = tmp_path / "extraction.tar"
    with tarfile.open(tar, "w") as tf:
        tf.add(fs, arcname=".")
    r1, r2 = _run(fs, tmp_path / "a"), _run(tar, tmp_path / "b")
    key = lambda arts: sorted(a["x_veritrace"]["fact_sha256"] for a in arts)
    assert key(r1.artifacts) == key(r2.artifacts)


def test_garbage_in_free_space_does_not_crash(fs, tmp_path):
    db = fs / SMS_DB
    raw = bytearray(db.read_bytes())
    rnd = random.Random(7)
    for off in range(4096 + 200, 4096 + 3000):              # zone libre de la page de la table sms
        raw[off] = rnd.randrange(256)
    db.write_bytes(bytes(raw))
    r = _run(fs, tmp_path)                                    # ni exception ni artefact invalide
    assert fragment_errors({"artifacts": r.artifacts}) == []


def test_unreadable_database_becomes_note(tmp_path):
    db = tmp_path / "x/data/data/com.android.providers.telephony/databases/mmssms.db"
    db.parent.mkdir(parents=True)
    db.write_bytes(os.urandom(8192))
    r = _run(tmp_path / "x", tmp_path)
    assert not r.artifacts and any("non examinée" in n for n in r.notes)


def test_ambiguous_signature_is_not_attributed(tmp_path):
    db = tmp_path / "a.db"
    con = sqlite3.connect(db)
    con.execute("PRAGMA secure_delete=OFF")
    con.execute("CREATE TABLE a (_id INTEGER PRIMARY KEY, x TEXT, y INTEGER)")
    con.execute("CREATE TABLE b (_id INTEGER PRIMARY KEY, u TEXT, v INTEGER)")
    con.executemany("INSERT INTO a VALUES (?,?,?)", [(i, "texte " * 30, i) for i in range(1, 200)])
    con.commit()
    con.execute("DELETE FROM a")
    con.commit()
    con.close()
    img = load_image(db)
    specs = [TableSpec("a", 2, ["_id", "x", "y"], ["INTEGER", "TEXT", "INTEGER"], 0),
             TableSpec("b", 3, ["_id", "u", "v"], ["INTEGER", "TEXT", "INTEGER"], 0)]
    carver = Carver(img, specs)
    found = carver.carve()
    # Les cellules des pages libres ont la même signature dans a et b : jamais attribuées au hasard.
    assert not [c for c in found if c.method == "page_libre"] and carver.stats.ambiguous > 0


# --------------------------------------------------------------------------- affaire, règles, rapports
@pytest.fixture
def case(tmp_path, fs):
    runner = CliRunner()
    case = tmp_path / "VT-R"
    r = runner.invoke(cli, ["case", "init", str(case), "--case-id", "VT-R", "--title", "Récupération",
                            "--org-name", "Cabinet Test"], input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    for args in (["parse", "sqlite", "--case", str(case), "--input", str(fs)],
                 ["parse", "recover", "--case", str(case), "--input", str(fs)]):
        r = runner.invoke(cli, args, input=AUTH_INPUT)
        assert r.exit_code == 0, r.output
    return case, fs, runner


def _doc(case):
    return json.loads((case / "normalized" / "veritrace_case.json").read_text(encoding="utf-8"))


def test_case_integration_and_rule_r6(case):
    path, fs, runner = case
    doc = _doc(path)
    assert validate(doc).ok
    recovered = [a for a in doc["artifacts"] if a["x_veritrace"].get("recovery")]
    assert recovered and not any(a["corroborated"] for a in recovered)
    r6 = [f for f in doc["findings"] if f["x_veritrace"].get("rule_id") == "R6"]
    kinds = Counter((f["title"].split(" : ")[0], f["severity"]) for f in r6)
    assert kinds == {("Enregistrements supprimés récupérés", "moyen"): 3,       # SMS, appels, WhatsApp
                     ("Enregistrements supprimés récupérés", "faible"): 1,      # navigation
                     ("Contenus antérieurs d'enregistrements modifiés", "faible"): 1}
    edited = next(f for f in r6 if f["title"].startswith("Contenus antérieurs"))
    assert D.WA_EDITED_BEFORE in edited["description"] and D.WA_EDITED_AFTER in edited["description"]
    assert len(edited["artifact_ids"]) == 2                   # version antérieure + ligne actuelle
    ev = [t for t in doc["timeline"] if "recupere" in t["x_veritrace"]["flags"]]
    assert len(ev) == len(recovered) and all(t["description"].startswith("[") for t in ev)
    assert {s["database"] for s in doc["x_veritrace"]["recovery"]} >= {SMS_DB}
    assert any("effacement sécurisé" in l for l in doc["case"]["x_veritrace"]["limitations"])

    # Ré-exécution : ni doublon d'artefact ni doublon de bilan
    r = runner.invoke(cli, ["parse", "recover", "--case", str(path), "--input", str(fs)], input=AUTH_INPUT)
    assert r.exit_code == 0 and "0 artefact(s) ajouté(s)" in r.output
    doc2 = _doc(path)
    assert len(doc2["artifacts"]) == len(doc["artifacts"])
    assert len(doc2["x_veritrace"]["recovery"]) == len(doc["x_veritrace"]["recovery"])


def test_reports_show_recovery(case):
    path, _, runner = case
    for template in ("judiciaire", "entreprise"):
        r = runner.invoke(cli, ["report", "--case", str(path), "--report", template, "--format", "md"],
                          input=AUTH_INPUT)
        assert r.exit_code == 0, r.output
    md = {p.name.split("_")[1]: p.read_text(encoding="utf-8") for p in (path / "reports").glob("*.md")}
    j = md["judiciaire"]
    assert "3.6 Récupération des enregistrements supprimés" in j
    assert "Enregistrements récupérés hors des données actives" in j
    assert D.SMS_DELETED[0] in j and "absent des données actives" in j and "bloc libre" in j
    assert "date de suppression n'est jamais connue" in j
    assert "Enregistrements supprimés récupérés" in md["entreprise"]
    r = runner.invoke(cli, ["report", "--case", str(path), "--report", "judiciaire", "--format", "pdf"],
                      input=AUTH_INPUT)
    assert r.exit_code == 0, r.output


def test_parse_all_can_skip_recovery(tmp_path, fs):
    runner = CliRunner()
    case = tmp_path / "VT-S"
    runner.invoke(cli, ["case", "init", str(case), "--case-id", "VT-S", "--title", "t", "--org-name", "o"],
                  input=AUTH_INPUT)
    r = runner.invoke(cli, ["parse", "all", "--case", str(case), "--input", str(fs), "--no-recover"],
                      input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    assert "] " in r.output and "veritrace-recover [" not in r.output
