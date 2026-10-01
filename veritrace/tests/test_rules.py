"""Règles de détection d'anomalies R1–R5 (format pivot)."""
import copy
import json

import pytest
from click.testing import CliRunner

from veritrace.cli import cli
from veritrace.correlation.engine import correlate
from veritrace.parsing.base import new_artifact
from veritrace.schema import validate

from conftest import AUTH_INPUT
from test_parsing import case_with_tools, _doc  # noqa: F401  (fixture réutilisée)

SPY = "com.sys.monitor.service"
TOOL = {"name": "ALEAPP", "version": "x"}


def _rule_findings(doc, rule_id):
    return [f for f in doc["findings"] if (f.get("x_veritrace") or {}).get("rule_id") == rule_id]


def _app(aid, pkg, installer, is_system, perms=(), first="2026-08-14T21:03:11+00:00"):
    return new_artifact(artifact_id=aid, category="application", timestamp=first, tool=TOOL, item_id="EV-001",
                        data={"package": pkg, "installer": installer, "is_system": is_system,
                              "first_install": first, "permissions": [f"android.permission.{p}" for p in perms]})


# --------------------------------------------------------------------------- sur l'exemple
def test_example_rules(example_doc):
    applied = {r["rule_id"]: r["hits"] for r in example_doc["x_veritrace"]["rules_applied"]}
    assert applied == {"R1": 1, "R2": 0, "R3": 1, "R4": 0, "R5": 1, "R6": 1}
    assert validate(example_doc).ok


def test_rule_findings_are_traceable_and_neutral(example_doc):
    for f in example_doc["findings"]:
        x = f.get("x_veritrace") or {}
        if not x.get("rule_id"):
            continue
        assert f["artifact_ids"], f["finding_id"]               # traçable jusqu'aux artefacts
        assert f["item_ids"], f["finding_id"]                   # … et aux éléments de preuve hachés
        assert x["interpretation"] and x["interpretation"] not in f["description"]   # faits ≠ interprétation
        assert f["finding_id"].startswith(f"F-{x['rule_id']}-") and x["rule_version"]


def test_idempotent_and_stable_ids(example_doc):
    ids = sorted(f["finding_id"] for f in example_doc["findings"])
    correlate(example_doc)
    correlate(example_doc)
    assert sorted(f["finding_id"] for f in example_doc["findings"]) == ids


# --------------------------------------------------------------------------- R1 / R2
def _doc_with(example_doc, *apps):
    d = copy.deepcopy(example_doc)
    d["artifacts"] += list(apps)
    return d


def test_r1_ignores_system_store_and_unknown_status(example_doc):
    d = _doc_with(example_doc,
                  _app("ART-9001", "com.android.settings", None, True),          # système
                  _app("ART-9002", "com.whatsapp", "com.android.vending", False, ["RECORD_AUDIO"]),  # magasin
                  _app("ART-9003", "com.inconnue", None, None))                  # statut système inconnu
    correlate(d)
    pkgs = {f["title"].split(" : ")[-1] for f in _rule_findings(d, "R1")}
    assert pkgs == {SPY}


def test_r1_manual_installer_and_severity(example_doc):
    d = _doc_with(example_doc,
                  _app("ART-9004", "com.tracker.lite", "com.google.android.packageinstaller", False, ["READ_SMS"]),
                  _app("ART-9005", "com.tracker.pro", "com.android.chrome", False, ["READ_SMS", "RECORD_AUDIO"]))
    correlate(d)
    sev = {f["title"].split(" : ")[-1]: f["severity"] for f in _rule_findings(d, "R1")}
    assert sev["com.tracker.lite"] == "moyen" and sev["com.tracker.pro"] == "eleve"


def test_r2_surveillance_capabilities_store_app(example_doc):
    d = _doc_with(example_doc,
                  _app("ART-9006", "com.parental.guard", "com.android.vending", False,
                       ["BIND_ACCESSIBILITY_SERVICE", "READ_SMS", "ACCESS_FINE_LOCATION"]),
                  _app("ART-9007", "com.legit.chat", "com.android.vending", False, ["RECORD_AUDIO", "CAMERA"]))
    correlate(d)
    r2 = _rule_findings(d, "R2")
    assert [f["title"] for f in r2] == ["Capacités de surveillance cumulées : com.parental.guard"]
    assert r2[0]["severity"] == "moyen"


# --------------------------------------------------------------------------- R3
def test_r3_download_then_install(example_doc):
    r3 = _rule_findings(example_doc, "R3")
    assert len(r3) == 1 and r3[0]["severity"] == "eleve"
    assert "4 min 29 s" in r3[0]["description"]
    cats = {a["category"] for a in example_doc["artifacts"] if a["artifact_id"] in r3[0]["artifact_ids"]}
    assert cats == {"navigation", "application"}


def test_r3_window_parameter(example_doc):
    d = copy.deepcopy(example_doc)
    d["case"]["x_veritrace"]["rules"] = {"download_window_minutes": 2}
    correlate(d)
    assert _rule_findings(d, "R3") == []


# --------------------------------------------------------------------------- R4
def test_r4_future_and_ancient_timestamps(example_doc):
    d = copy.deepcopy(example_doc)
    for aid, ts in (("ART-9101", "2031-01-01T12:00:00+00:00"), ("ART-9102", "1999-12-31T00:00:00+00:00")):
        d["artifacts"].append(new_artifact(artifact_id=aid, category="appel", timestamp=ts, tool=TOOL, item_id="EV-001",
                                           data={"direction": "entrant", "number": "+22670000009", "duration_s": 5}))
    correlate(d)
    titles = {f["title"]: f for f in _rule_findings(d, "R4")}
    assert set(titles) == {"Horodatages postérieurs à l'acquisition", "Horodatages antérieurs à l'existence d'Android"}
    assert titles["Horodatages postérieurs à l'acquisition"]["artifact_ids"] == ["ART-9101"]
    # les dates impossibles n'entrent pas dans le calcul des interruptions (R5)
    for f in _rule_findings(d, "R5"):
        assert "ART-9101" not in f["artifact_ids"] and "ART-9102" not in f["artifact_ids"]
    assert validate(d).ok


# --------------------------------------------------------------------------- R5
def test_r5_gap(example_doc):
    r5 = _rule_findings(example_doc, "R5")
    assert len(r5) == 1 and r5[0]["severity"] == "faible" and "18.1 jours" in r5[0]["title"]


def test_r5_threshold(example_doc):
    d = copy.deepcopy(example_doc)
    d["case"]["x_veritrace"]["rules"] = {"gap_hours": 24 * 30}
    correlate(d)
    assert _rule_findings(d, "R5") == []


# --------------------------------------------------------------------------- configuration / revue
def test_disabled_rule_is_recorded(example_doc):
    d = copy.deepcopy(example_doc)
    d["case"]["x_veritrace"]["rules"] = {"disabled": ["R5", "R1"]}
    correlate(d)
    assert not _rule_findings(d, "R5") and not _rule_findings(d, "R1")
    state = {r["rule_id"]: r["enabled"] for r in d["x_veritrace"]["rules_applied"]}
    assert state["R5"] is False and state["R3"] is True


def test_reviewed_finding_is_preserved(example_doc):
    d = copy.deepcopy(example_doc)
    f = _rule_findings(d, "R5")[0]
    f["x_veritrace"]["reviewed"] = True
    f["x_veritrace"]["interpretation"] = "Appareil en réparation du 15/08 au 31/08 (facture au dossier)."
    d["case"]["x_veritrace"]["rules"] = {"disabled": ["R5"]}
    correlate(d)
    kept = [x for x in d["findings"] if x["finding_id"] == f["finding_id"]]
    assert len(kept) == 1 and kept[0]["x_veritrace"]["interpretation"].startswith("Appareil en réparation")


# --------------------------------------------------------------------------- bout en bout (vraies sorties d'outils)
def test_end_to_end_rules_on_real_tool_outputs(case_with_tools):
    case, _, runner = case_with_tools
    doc = _doc(case)
    applied = {r["rule_id"]: r["hits"] for r in doc["x_veritrace"]["rules_applied"]}
    assert applied["R1"] == 1 and applied["R3"] == 1 and applied["R4"] == 1   # appel daté de 2031
    r1 = _rule_findings(doc, "R1")[0]
    assert SPY in r1["title"] and r1["severity"] == "eleve"                    # permissions sensibles (ALEAPP)
    assert "com.android.settings" not in json.dumps(_rule_findings(doc, "R1"))  # app système exclue
    flags = {fl for t in doc["timeline"] for fl in t["x_veritrace"]["flags"]}
    assert {"anomalie", "application_suspecte", "ioc"} <= flags

    r = runner.invoke(cli, ["rules", "config", "--case", str(case), "--disable", "R4"], input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    assert not _rule_findings(_doc(case), "R4")

    fid = _rule_findings(_doc(case), "R1")[0]["finding_id"]
    r = runner.invoke(cli, ["rules", "review", "--case", str(case), fid, "--interpretation", "Revu."], input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    r = runner.invoke(cli, ["correlate", "--case", str(case)], input=AUTH_INPUT)
    f = next(x for x in _doc(case)["findings"] if x["finding_id"] == fid)
    assert f["x_veritrace"]["reviewed"] and f["x_veritrace"]["interpretation"] == "Revu."

    r = runner.invoke(cli, ["report", "--case", str(case), "--report", "judiciaire", "--format", "md"], input=AUTH_INPUT)
    md = next((case / "reports").glob("*judiciaire*.md")).read_text(encoding="utf-8")
    assert "3.5 Règles de détection appliquées" in md and "revu par l'examinateur" in md
    assert "généré automatiquement, non revu" in md
    # interprétation générée non revue : jamais présentée comme celle de l'examinateur
    assert "Interprétation proposée automatiquement (règle R3) — non revue par l'examinateur" in md
    assert "Interprétation proposée automatiquement (MVT) — non revue par l'examinateur" in md


def test_rules_list_command():
    r = CliRunner().invoke(cli, ["rules", "list"], input=AUTH_INPUT)
    assert r.exit_code == 0 and all(f"R{i}" in r.output for i in range(1, 6))


def test_rule_ids_do_not_disturb_numbering(case_with_tools):
    """Les identifiants des constats de règles (F-R4-…) ne perturbent pas la numérotation F-001, F-002…"""
    case, _, _ = case_with_tools
    ids = [f["finding_id"] for f in _doc(case)["findings"] if not (f.get("x_veritrace") or {}).get("rule_id")]
    assert ids and all(len(i) == 5 and i.startswith("F-") for i in ids), ids
