import json
from pathlib import Path

import pytest

from veritrace.schema import content_hash, ensure_valid, validate
from veritrace.schema.example import example_json
from veritrace.schema.validator import CaseValidationError

EXAMPLE_FILE = Path(__file__).parents[1] / "veritrace" / "schema" / "examples" / "example_case.json"


def _messages(report):
    return [str(i) for i in report.errors]


def test_example_is_valid(example_doc):
    report = validate(example_doc)
    assert report.ok, _messages(report)
    assert not report.warnings


def test_committed_example_matches_builder():
    assert EXAMPLE_FILE.read_text(encoding="utf-8") == example_json(), \
        "Régénérer : python -m veritrace.schema.example > veritrace/schema/examples/example_case.json"


def test_example_has_corroborated_artifacts(example_doc):
    corr = [a for a in example_doc["artifacts"] if a["corroboration"]["status"] == "corroborated"]
    assert {a["artifact_id"] for a in corr} == {"ART-0001", "ART-0002", "ART-0004", "ART-0005"}


def test_missing_required_field(example_doc):
    del example_doc["case"]["legal_authorization"]
    assert any("legal_authorization" in m for m in _messages(validate(example_doc)))


def test_category_specific_data(example_doc):
    sms = example_doc["artifacts"][0]
    del sms["data"]["address"]
    sms["content_sha256"] = content_hash("sms", sms["data"])
    assert any("address" in m for m in _messages(validate(example_doc)))


def test_duplicate_id(example_doc):
    example_doc["artifacts"][1]["artifact_id"] = example_doc["artifacts"][0]["artifact_id"]
    assert any("dupliqué" in m for m in _messages(validate(example_doc)))


def test_dangling_reference(example_doc):
    example_doc["artifacts"][0]["source"]["run_id"] = "RUN-INEXISTANT"
    assert any("RUN-INEXISTANT" in m for m in _messages(validate(example_doc)))


def test_custody_hash_mismatch(example_doc):
    example_doc["custody_chain"][3]["sha256"] = "f" * 64
    assert any("rupture de la chaîne de custody" in m for m in _messages(validate(example_doc)))


def test_evidence_without_collection_event(example_doc):
    example_doc["custody_chain"] = [c for c in example_doc["custody_chain"] if c["evidence_id"] != "EV-002"]
    assert any("collected" in m for m in _messages(validate(example_doc)))


def test_content_hash_mismatch(example_doc):
    example_doc["artifacts"][0]["data"]["body"] = "modifié"
    assert any("content_sha256" in m for m in _messages(validate(example_doc)))


def test_corroborated_requires_two_tools(example_doc):
    a = example_doc["artifacts"][2]
    a["corroboration"]["status"] = "corroborated"
    assert any("deux moteurs" in m for m in _messages(validate(example_doc)))


@pytest.mark.parametrize("ts", ["2026-13-01T00:00:00Z", "2026-09-02 19:44:05", "2026-09-02T19:44:05"])
def test_bad_timestamps(example_doc, ts):
    example_doc["artifacts"][0]["timestamp"] = ts
    assert not validate(example_doc).ok


def test_ensure_valid_raises(example_doc):
    example_doc["devices"] = "pas une liste"
    with pytest.raises(CaseValidationError):
        ensure_valid(example_doc)


def test_files_rehashed_with_case_root(example_doc, tmp_path):
    report = validate(example_doc, case_root=tmp_path)
    assert any("introuvable" in m for m in _messages(report))


def test_schema_is_valid_json_schema():
    from jsonschema import Draft202012Validator
    from veritrace.schema.validator import load_schema

    Draft202012Validator.check_schema(load_schema())


def test_example_roundtrip_json(example_doc):
    assert validate(json.loads(json.dumps(example_doc))).ok


def test_exhibit_reference_and_duplicates(example_doc):
    ex = example_doc["findings"][0]["exhibits"]
    ex[1]["exhibit_id"] = ex[0]["exhibit_id"]
    ex[0]["artifact_id"] = "ART-NOPE"
    msgs = _messages(validate(example_doc))
    assert any("pièce dupliqué" in m for m in msgs) and any("ART-NOPE" in m for m in msgs)


def test_remediation_priority_enum(example_doc):
    example_doc["findings"][0]["remediation"][0]["priority"] = "urgent"
    assert not validate(example_doc).ok
