"""Wrappers ALEAPP / MVT / Autopsy, corrélation inter-outils, gestion des outils absents.

Les sorties ALEAPP et MVT utilisées sont des sorties RÉELLES (ALEAPP 2026.4.2, MVT
2026.9.28) produites sur l'extraction synthétique de fixtures/android_fs.py.
Les tests marqués `real_tools` lancent les vrais outils si VERITRACE_ALEAPP / VERITRACE_MVT
pointent vers une installation (sinon ils sont ignorés).
"""
import json
import os
import shutil
from collections import Counter
from pathlib import Path

import pytest
from click.testing import CliRunner

from veritrace.cli import cli
from veritrace.core.audit import AuditLog
from veritrace.parsing.aleapp import normalize as aleapp_normalize
from veritrace.parsing.autopsy import find_case_db, normalize as autopsy_normalize
from veritrace.parsing.base import ArtifactBuilder
from veritrace.parsing.mvt import IocFileError, check_stix2, detect_mode, normalize as mvt_normalize
from veritrace.schema import validate

from conftest import AUTH_INPUT
from fixtures.android_fs import SPY_PKG, build_android_fs, build_dumpsys
from fixtures.autopsy_case import build_autopsy_case

FIX = Path(__file__).parent / "fixtures"
ALEAPP_OUT = FIX / "aleapp_2026.4.2"
MVT_OUT = FIX / "mvt_2026.9.28"
IOCS = FIX / "iocs" / "fictivespy.stix2"


# --------------------------------------------------------------------------- normaliseurs
def _facts(builder):
    return {(a["category"], a["x_veritrace"]["fact_sha256"]) for a in builder.items}


def test_aleapp_lava_and_tsv_give_same_facts(tmp_path):
    lava = ArtifactBuilder("R", "E")
    aleapp_normalize(ALEAPP_OUT, lava, {"name": "ALEAPP", "version": "2026.4.2"})
    shutil.copytree(ALEAPP_OUT / "_TSV Exports", tmp_path / "_TSV Exports")
    tsv = ArtifactBuilder("R", "E")
    aleapp_normalize(tmp_path, tsv, {"name": "ALEAPP", "version": "2026.4.2"})
    assert _facts(lava) == _facts(tsv)
    cats = Counter(a["category"] for a in lava.items)
    assert cats == {"sms": 2, "appel": 3, "application": 3, "usage_app": 2, "navigation": 1,
                    "localisation": 1, "wifi": 1, "bluetooth": 1, "compte": 1, "contact": 1}


def test_aleapp_fields_and_internal_dedup():
    b = ArtifactBuilder("R", "E")
    aleapp_normalize(ALEAPP_OUT, b, {"name": "ALEAPP", "version": "2026.4.2"})
    assert b.internal_duplicates >= 3          # SMS lus dans 2 artefacts ALEAPP, Wi-Fi dans 2
    by = {(a["category"], a["timestamp"]): a for a in b.items}
    call = by[("appel", "2026-09-02T20:01:47+00:00")]
    assert call["data"]["direction"] == "manque"   # balise HTML d'icône retirée
    spy = next(a for a in b.items if a["category"] == "application" and a["data"]["package"] == SPY_PKG)
    assert spy["data"]["installer"] is None and spy["source"]["file_path"] == "data/system/packages.xml"
    assert spy["data"]["is_system"] is False and "android.permission.READ_SMS" in spy["data"]["permissions"]
    settings = next(a for a in b.items if a["category"] == "application" and a["data"]["package"] == "com.android.settings")
    assert settings["data"]["is_system"] is True            # /system/priv-app → application système
    wifi = next(a for a in b.items if a["category"] == "wifi")
    assert wifi["data"]["bssid"] == "a4:2b:b0:00:00:01"   # complété par le second artefact ALEAPP
    usage = [a for a in b.items if a["category"] == "usage_app"]
    assert {u["data"]["event"] for u in usage} == {"premier_plan", "arriere_plan"}


def test_mvt_detection_becomes_critical_finding():
    b = ArtifactBuilder("R", "E")
    findings, _ = mvt_normalize(MVT_OUT, b, {"name": "MVT", "version": "2026.9.28"})
    ioc = [f for f in findings if f["type"] == "ioc"]
    assert len(ioc) == 1 and ioc[0]["severity"] == "critique"
    assert ioc[0]["ioc"] == {"type": "application", "value": SPY_PKG, "source": "fictivespy.stix2", "family": "FictiveSpy"}
    assert SPY_PKG in ioc[0]["title"] and "FictiveSpy" in ioc[0]["title"]
    arts = {a["artifact_id"]: a for a in b.items}
    cats = {arts[x]["category"] for x in ioc[0]["artifact_ids"]}
    assert cats == {"ioc", "application"}
    m = next(a for a in b.items if a["category"] == "ioc")
    assert m["data"]["ioc_source"] == "fictivespy.stix2" and m["data"]["malware_family"] == "FictiveSpy"
    heur = [f for f in findings if f["type"] != "ioc"]
    assert heur and all(f["severity"] in ("moyen", "eleve", "critique") for f in heur)


def test_mvt_non_critical_ioc_is_at_least_high(tmp_path):
    shutil.copytree(MVT_OUT, tmp_path / "o")
    alerts = json.loads((tmp_path / "o" / "alerts.json").read_text())
    for a in alerts:
        if a.get("matched_indicator"):
            a["level"] = "MEDIUM"
    (tmp_path / "o" / "alerts.json").write_text(json.dumps(alerts))
    findings, _ = mvt_normalize(tmp_path / "o", ArtifactBuilder("R", "E"), {"name": "MVT", "version": "x"})
    assert next(f for f in findings if f["type"] == "ioc")["severity"] == "eleve"


def test_stix2_validation(tmp_path):
    assert check_stix2(IOCS) == 2
    bad = tmp_path / "bad.stix2"
    bad.write_text('{"type": "bundle", "objects": []}')
    with pytest.raises(IocFileError):
        check_stix2(bad)


def test_mvt_mode_detection(tmp_path):
    (tmp_path / "aqf").mkdir()
    (tmp_path / "aqf" / "packages.json").write_text("[]")
    assert detect_mode(tmp_path / "aqf") == "androidqf"
    (tmp_path / "b.ab").write_bytes(b"ANDROID BACKUP\n")
    assert detect_mode(tmp_path / "b.ab") == "backup"
    (tmp_path / "fs").mkdir()
    assert detect_mode(tmp_path / "fs") is None        # pas de supposition


def test_autopsy_android_module_only_and_engine(tmp_path):
    db = find_case_db(build_autopsy_case(tmp_path / "case"))
    b = ArtifactBuilder("R", "E")
    notes = autopsy_normalize(db, b, "4.21.0")
    assert not any(a["category"] == "navigation" for a in b.items)   # module Recent Activity exclu
    assert "Recent Activity" in " ".join(notes)
    assert b.internal_duplicates == 1                                        # SMS en double
    loc = next(a for a in b.items if a["category"] == "localisation")
    assert loc["x_veritrace"]["engine"] == "ALEAPP"                         # module aLEAPP d'Autopsy
    b2 = ArtifactBuilder("R", "E")
    autopsy_normalize(db, b2, None, ("android", "aleapp", "recent activity"))
    assert any(a["category"] == "navigation" for a in b2.items)


# --------------------------------------------------------------------------- bout en bout
@pytest.fixture
def case_with_tools(tmp_path):
    runner = CliRunner()
    case = tmp_path / "VT-B"
    fs = build_android_fs(tmp_path / "extraction")
    autopsy = build_autopsy_case(tmp_path / "autopsy_case")
    dumpsys = build_dumpsys(tmp_path / "dumpsys")
    r = runner.invoke(cli, ["case", "init", str(case), "--case-id", "VT-B", "--title", "Intégration",
                            "--org-name", "Cabinet Test"], input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    for args in (["parse", "aleapp", "--case", str(case), "--input", str(fs), "--from-output", str(ALEAPP_OUT)],
                 ["parse", "mvt", "--case", str(case), "--input", str(fs), "--from-output", str(MVT_OUT),
                  "--iocs", str(IOCS)],
                 ["parse", "autopsy", "--case", str(case), "--input", str(autopsy), "--autopsy-version", "4.21.0"],
                 ["parse", "sqlite", "--case", str(case), "--input", str(fs)],
                 ["parse", "sqlite", "--case", str(case), "--input", str(dumpsys)]):
        r = runner.invoke(cli, args, input=AUTH_INPUT)
        assert r.exit_code == 0, r.output
    return case, fs, runner


def _doc(case):
    return json.loads((case / "normalized" / "veritrace_case.json").read_text(encoding="utf-8"))


def test_end_to_end_corroboration_and_dedup(case_with_tools):
    case, _, _ = case_with_tools
    doc = _doc(case)
    assert validate(doc).ok
    by_fact = {}
    for a in doc["artifacts"]:
        by_fact.setdefault((a["category"], a["x_veritrace"]["fact_sha256"]), []).append(a)

    def status(category, pred):
        group = next(g for (c, _), g in by_fact.items() if c == category and pred(g[0]))
        return {a["corroborated"] for a in group}, {a["source"]["tool"] for a in group}, group

    st, tools, g = status("application", lambda a: a["data"]["package"] == SPY_PKG)
    assert st == {True} and tools == {"ALEAPP", "MVT", "Autopsy", "veritrace-sqlite"}
    assert g[0]["corroborated_by"] == ["ALEAPP", "Autopsy", "MVT", "veritrace-sqlite"]
    st, tools, _ = status("sms", lambda a: a["timestamp"].startswith("2026-09-02T19:44:05"))
    assert st == {True} and tools == {"ALEAPP", "Autopsy", "veritrace-sqlite"}
    st, _, _ = status("appel", lambda a: a["timestamp"].startswith("2026-09-02T20:01:47"))
    assert st == {True}                                   # « manqué » (ALEAPP) = « entrant » (Autopsy)
    st, tools, _ = status("localisation", lambda a: a["data"].get("provider") != "exif" and
                          a["source"]["tool"] != "veritrace-sqlite")
    # ALEAPP + Autopsy/aLEAPP seuls ne seraient pas indépendants ; la position GPS de la photo (EXIF,
    # moteur natif) décrit le même fait et le corrobore.
    assert st == {True} and tools == {"ALEAPP", "Autopsy", "veritrace-sqlite"}

    # Dédoublonnage : un événement de timeline par fait, pas par artefact
    auto = [t for t in doc["timeline"] if t["x_veritrace"]["generated"]]
    sms_events = [t for t in auto if t["category"] == "sms" and t["timestamp"].startswith("2026-09-02T19:44:05")]
    assert len(sms_events) == 1 and len(sms_events[0]["artifact_ids"]) == 3 and sms_events[0]["corroborated"]

    # Constat IOC MVT : critique, relié aux artefacts des autres outils, corroboré
    f = next(f for f in doc["findings"] if f["type"] == "ioc")
    assert f["severity"] == "critique" and f["corroborated"] and f["ioc"]["value"] == SPY_PKG
    tools = {a["source"]["tool"] for a in doc["artifacts"] if a["artifact_id"] in f["artifact_ids"]}
    assert tools == {"MVT", "ALEAPP", "Autopsy", "veritrace-sqlite"}
    item_types = {i["type"] for a in doc["acquisitions"] for i in a["items"]}
    assert {"extraction", "ioc", "sortie_outil"} <= item_types
    assert {a["method"] for a in doc["acquisitions"]} == {"import"}
    assert (case / "custody" / "iocs" / "fictivespy.stix2").is_file()
    assert any((case / "custody" / "manifests").glob("EV-*.sha256sum"))


def test_rerun_does_not_duplicate(case_with_tools):
    case, fs, runner = case_with_tools
    before = len(_doc(case)["artifacts"])
    r = runner.invoke(cli, ["parse", "aleapp", "--case", str(case), "--input", str(fs),
                            "--from-output", str(ALEAPP_OUT)], input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    doc = _doc(case)
    assert len(doc["artifacts"]) == before
    assert "déjà présent" in doc["x_veritrace"]["tool_runs"][-1]["message"]


def test_reports_after_ingest(case_with_tools):
    case, _, runner = case_with_tools
    for tpl in ("judiciaire", "entreprise"):
        r = runner.invoke(cli, ["report", "--case", str(case), "--report", tpl], input=AUTH_INPUT)
        assert r.exit_code == 0, r.output
    md = next((case / "reports").glob("*judiciaire*.md")).read_text(encoding="utf-8")
    assert "Corroboré (fiabilité renforcée)" in md and "Faits uniques" in md
    assert "Autopsy (moteur ALEAPP)" in md or "moteur(s)" in md


def test_fragment_and_audit(case_with_tools):
    case, _, _ = case_with_tools
    frags = list((case / "parsed").glob("*/RUN-*/veritrace_normalized.json"))
    assert {f.parts[-3] for f in frags} == {"aleapp", "mvt", "autopsy", "veritrace-sqlite"}
    audit = AuditLog(case / "audit" / "audit.jsonl")
    assert audit.verify().ok
    assert [e["action"] for e in audit.entries()].count("tool_ingested") == 5


def test_missing_tool_is_warning_not_crash(tmp_path, monkeypatch):
    monkeypatch.setenv("PATH", str(tmp_path / "vide"))
    for var in ("VERITRACE_ALEAPP", "VERITRACE_MVT"):
        monkeypatch.delenv(var, raising=False)
    runner = CliRunner()
    case = tmp_path / "VT-C"
    fs = build_android_fs(tmp_path / "x")
    runner.invoke(cli, ["case", "init", str(case), "--case-id", "VT-C", "--title", "t", "--org-name", "o"],
                  input=AUTH_INPUT)
    r = runner.invoke(cli, ["parse", "all", "--case", str(case), "--input", str(fs)], input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    assert "ignore" in r.output
    doc = _doc(case)
    status = {t["tool"]: t["status"] for t in doc["x_veritrace"]["tool_runs"]}
    assert status == {"ALEAPP": "ignore", "MVT": "ignore", "veritrace-sqlite": "succes"}  # moteur natif toujours présent
    assert validate(doc).ok
    r = runner.invoke(cli, ["report", "--case", str(case), "--report", "judiciaire", "--format", "md"],
                      input=AUTH_INPUT)
    assert r.exit_code == 0 and "non exécuté" in next((case / "reports").glob("*.md")).read_text(encoding="utf-8")


def test_modified_evidence_blocks_analysis(case_with_tools):
    case, fs, runner = case_with_tools
    (fs / "data" / "system" / "packages.xml").write_text("<packages/>")
    r = runner.invoke(cli, ["parse", "aleapp", "--case", str(case), "--input", str(fs),
                            "--from-output", str(ALEAPP_OUT)], input=AUTH_INPUT)
    assert r.exit_code != 0 and "modifiée" in r.output


def test_invalid_ioc_file_is_failed_run(tmp_path, case_with_tools):
    case, fs, runner = case_with_tools
    bad = tmp_path / "bad.stix2"
    bad.write_text("{}")
    r = runner.invoke(cli, ["parse", "mvt", "--case", str(case), "--input", str(fs), "--from-output", str(MVT_OUT),
                            "--iocs", str(bad)], input=AUTH_INPUT)
    assert r.exit_code == 0 and "echec" in r.output
    assert _doc(case)["x_veritrace"]["tool_runs"][-1]["status"] == "echec"


# --------------------------------------------------------------------------- vrais outils (optionnel)
@pytest.mark.skipif(not os.environ.get("VERITRACE_ALEAPP"), reason="ALEAPP non configuré (VERITRACE_ALEAPP)")
def test_real_aleapp_run(tmp_path):
    runner = CliRunner()
    case = tmp_path / "VT-R"
    fs = build_android_fs(tmp_path / "x")
    runner.invoke(cli, ["case", "init", str(case), "--case-id", "VT-R", "--title", "t", "--org-name", "o"],
                  input=AUTH_INPUT)
    r = runner.invoke(cli, ["parse", "aleapp", "--case", str(case), "--input", str(fs)], input=AUTH_INPUT)
    assert r.exit_code == 0 and "succes" in r.output, r.output
    run = _doc(case)["x_veritrace"]["tool_runs"][-1]
    assert run["mode"] == "execute" and run["artifacts_produced"] >= 10


@pytest.mark.skipif(not os.environ.get("VERITRACE_MVT"), reason="MVT non configuré (VERITRACE_MVT)")
def test_real_mvt_run(tmp_path):
    runner = CliRunner()
    case = tmp_path / "VT-M"
    aqf = tmp_path / "aqf"
    aqf.mkdir()
    (aqf / "packages.json").write_text(json.dumps([
        {"name": SPY_PKG, "files": [], "installer": "null", "uid": 10245, "disabled": False, "system": False,
         "third_party": True}]))
    runner.invoke(cli, ["case", "init", str(case), "--case-id", "VT-M", "--title", "t", "--org-name", "o"],
                  input=AUTH_INPUT)
    r = runner.invoke(cli, ["parse", "mvt", "--case", str(case), "--input", str(aqf), "--iocs", str(IOCS)],
                      input=AUTH_INPUT)
    assert r.exit_code == 0 and "succes" in r.output, r.output
    f = next(f for f in _doc(case)["findings"] if f["type"] == "ioc")
    assert f["severity"] == "critique"


def test_every_wrapper_output_is_pivot_format(case_with_tools):
    """Chaque sortie de wrapper (fragment) est conforme aux définitions artifact/finding du schéma pivot."""
    from veritrace.schema.validator import fragment_errors

    case, _, _ = case_with_tools
    frags = sorted((case / "parsed").glob("*/RUN-*/veritrace_normalized.json"))
    assert len(frags) == 5
    for f in frags:
        data = json.loads(f.read_text(encoding="utf-8"))
        assert data["artifacts"], f
        assert fragment_errors(data) == [], f
