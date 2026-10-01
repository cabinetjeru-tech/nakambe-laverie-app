"""Validateur du format pivot (draft-07 + contrôles sémantiques) et document d'exemple."""
import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft7Validator

from veritrace.schema import content_hash, ensure_valid, validate
from veritrace.schema.example import example_json
from veritrace.schema.validator import CaseValidationError, load_schema

EXAMPLE_FILE = Path(__file__).parents[1] / "veritrace" / "schema" / "examples" / "example_case.json"


def _messages(report):
    return [str(i) for i in report.errors]


def test_schema_is_draft07():
    schema = load_schema()
    assert schema["$schema"] == "http://json-schema.org/draft-07/schema#"
    Draft7Validator.check_schema(schema)
    assert schema["required"] == ["case", "device", "acquisitions", "artifacts", "findings", "timeline",
                                  "chain_of_custody"]


def test_case_block_matches_promoter_spec():
    """Le bloc `case` fourni par le promoteur est repris tel quel (+ politique-entreprise)."""
    case = load_schema()["properties"]["case"]
    assert case["required"] == ["case_id", "examiner", "authorization", "created_at"]
    auth = case["properties"]["authorization"]
    assert auth["required"] == ["type", "reference", "confirmed_by", "confirmed_at"]
    assert auth["properties"]["type"]["enum"] == ["consentement", "mandat", "ordre_judiciaire", "politique-entreprise"]
    assert case["properties"]["created_at"] == {"type": "string", "format": "date-time"}


def test_completed_sections_are_flagged_for_review():
    props = load_schema()["properties"]
    for key in ("device", "acquisitions", "artifacts", "findings", "timeline", "chain_of_custody"):
        assert "A VALIDER" in props[key]["$comment"], key


def test_example_is_valid(example_doc):
    report = validate(example_doc)
    assert report.ok, _messages(report)
    assert not report.warnings


def test_committed_example_matches_builder():
    assert EXAMPLE_FILE.read_text(encoding="utf-8") == example_json(), \
        "Régénérer : python -m veritrace.schema.example > veritrace/schema/examples/example_case.json"


def test_example_corroboration(example_doc):
    corr = {a["artifact_id"]: a["corroborated_by"] for a in example_doc["artifacts"] if a["corroborated"]}
    assert corr == {"ART-0001": ["ALEAPP", "veritrace-sqlite"], "ART-0002": ["ALEAPP", "veritrace-sqlite"],
                    "ART-0004": ["ALEAPP", "MVT"], "ART-0005": ["ALEAPP", "MVT"]}


def test_extensions_only_under_x_veritrace(example_doc):
    """Aucun champ hors schéma : additionalProperties=false hors bloc case (repris tel quel)."""
    bad = copy.deepcopy(example_doc)
    bad["artifacts"][0]["fact_sha256"] = "x"          # doit être sous x_veritrace
    assert any("Additional properties" in m for m in _messages(validate(bad)))


def test_missing_authorization(example_doc):
    del example_doc["case"]["authorization"]
    assert any("authorization" in m for m in _messages(validate(example_doc)))


def test_authorization_type_enum(example_doc):
    example_doc["case"]["authorization"]["type"] = "requisition"
    assert not validate(example_doc).ok
    example_doc["case"]["authorization"]["type"] = "politique-entreprise"
    assert validate(example_doc).ok


def test_category_specific_data(example_doc):
    sms = example_doc["artifacts"][0]
    del sms["data"]["address"]
    sms["sha256"] = content_hash("sms", sms["data"])
    assert any("address" in m for m in _messages(validate(example_doc)))


def test_duplicate_id(example_doc):
    example_doc["artifacts"][1]["artifact_id"] = example_doc["artifacts"][0]["artifact_id"]
    assert any("dupliqué" in m for m in _messages(validate(example_doc)))


def test_dangling_item_reference(example_doc):
    example_doc["artifacts"][0]["source"]["item_id"] = "EV-999"
    assert any("EV-999" in m for m in _messages(validate(example_doc)))


def test_custody_hash_mismatch(example_doc):
    example_doc["chain_of_custody"][3]["sha256"] = "f" * 64
    assert any("rupture de la chaîne de custody" in m for m in _messages(validate(example_doc)))


def test_item_without_collection_event(example_doc):
    example_doc["chain_of_custody"] = [c for c in example_doc["chain_of_custody"] if c["item_id"] != "EV-002"]
    assert any("collecte" in m for m in _messages(validate(example_doc)))


def test_content_hash_mismatch(example_doc):
    example_doc["artifacts"][0]["data"]["body"] = "modifié"
    assert any(".sha256" in m and "ne correspond pas aux données" in m for m in _messages(validate(example_doc)))


def test_corroborated_requires_two_engines(example_doc):
    a = next(a for a in example_doc["artifacts"] if a["artifact_id"] == "ART-0003")
    a["corroborated"] = True
    assert any("deux moteurs" in m for m in _messages(validate(example_doc)))


def test_corroboration_not_hidden(example_doc):
    a = next(a for a in example_doc["artifacts"] if a["artifact_id"] == "ART-0004")
    a["corroborated"] = False
    assert any("non marqué corroboré" in m for m in _messages(validate(example_doc)))


def test_fact_extension_checked(example_doc):
    example_doc["artifacts"][0]["x_veritrace"]["fact_sha256"] = "0" * 64
    assert any("fact_sha256" in m for m in _messages(validate(example_doc)))


def test_extension_is_optional(example_doc):
    """Un producteur tiers peut omettre x_veritrace : le document reste conforme."""
    for a in example_doc["artifacts"]:
        a.pop("x_veritrace")
    for f in example_doc["findings"]:
        f.pop("x_veritrace")
    for t in example_doc["timeline"]:
        t.pop("x_veritrace")
    example_doc["case"].pop("x_veritrace")
    example_doc.pop("x_veritrace")
    assert validate(example_doc).ok, _messages(validate(example_doc))


@pytest.mark.parametrize("ts", ["2026-13-01T00:00:00Z", "2026-09-02 19:44:05", "2026-09-02T19:44:05"])
def test_bad_timestamps(example_doc, ts):
    example_doc["artifacts"][0]["timestamp"] = ts
    assert not validate(example_doc).ok


def test_ensure_valid_raises(example_doc):
    example_doc["device"] = "pas un objet"
    with pytest.raises(CaseValidationError):
        ensure_valid(example_doc)


def test_files_rehashed_with_case_root(example_doc, tmp_path):
    assert any("introuvable" in m for m in _messages(validate(example_doc, case_root=tmp_path)))


def test_exhibit_reference_and_duplicates(example_doc):
    ex = example_doc["findings"][0]["x_veritrace"]["exhibits"]
    ex[1]["exhibit_id"] = ex[0]["exhibit_id"]
    ex[0]["artifact_id"] = "ART-NOPE"
    msgs = _messages(validate(example_doc))
    assert any("dupliqué" in m for m in msgs) and any("ART-NOPE" in m for m in msgs)


def test_enums_are_french_pivot_values(example_doc):
    example_doc["findings"][0]["severity"] = "critical"
    example_doc["findings"][0]["x_veritrace"]["remediation"][0]["priority"] = "urgent"
    msgs = " ".join(_messages(validate(example_doc)))
    assert "critical" in msgs and "urgent" in msgs


def test_example_roundtrip_json(example_doc):
    assert validate(json.loads(json.dumps(example_doc))).ok
