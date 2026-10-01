import json

import pytest

from veritrace import CREDIT_LINE
from veritrace.reporting import generate
from veritrace.reporting.markdown import render_markdown
from veritrace.reporting.model import build_report_model
from veritrace.schema.validator import CaseValidationError


@pytest.fixture
def example_file(tmp_path, example_doc):
    p = tmp_path / "case.json"
    p.write_text(json.dumps(example_doc, ensure_ascii=False), encoding="utf-8")
    return p


@pytest.mark.parametrize("template", ["judiciaire", "entreprise"])
def test_generate_both_formats(tmp_path, example_file, template):
    res = generate(example_file, template=template, out_dir=tmp_path / "out")
    md = res.outputs["md"].read_text(encoding="utf-8")
    assert res.outputs["pdf"].read_bytes().startswith(b"%PDF")
    assert CREDIT_LINE in md
    assert "VT-2026-0042" in md
    assert "Emplacement logo" in md
    assert res.source_sha256 in md
    manifest = json.loads(res.manifest.read_text(encoding="utf-8"))
    assert manifest["outputs"]["pdf"]["sha256"] == res.output_sha256["pdf"]


def test_findings_in_both_templates(example_doc):
    for tpl in ("judiciaire", "entreprise"):
        md = render_markdown(build_report_model(example_doc, tpl, source_sha256="0" * 64))
        for f in example_doc["findings"]:
            assert f["title"] in md


def test_templates_differ(example_doc):
    jud = render_markdown(build_report_model(example_doc, "judiciaire", source_sha256="0" * 64))
    ent = render_markdown(build_report_model(example_doc, "entreprise", source_sha256="0" * 64))
    assert "Attestation" in jud and "Attestation" not in ent
    assert "Synthèse exécutive" in ent and "Synthèse exécutive" not in jud
    assert "Recommandation" in ent


def test_invalid_document_refused(tmp_path, example_doc):
    example_doc["artifacts"][0]["data"]["body"] = "altéré"
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(example_doc), encoding="utf-8")
    with pytest.raises(CaseValidationError):
        generate(p, template="judiciaire", out_dir=tmp_path / "out")
    assert not (tmp_path / "out").exists() or not any((tmp_path / "out").iterdir())


def test_logo_used_when_present(tmp_path, example_doc):
    PIL = pytest.importorskip("PIL.Image")
    PIL.new("RGB", (240, 120), (31, 58, 95)).save(tmp_path / "logo.png")
    example_doc["case"]["organization"]["logo_path"] = "logo.png"
    p = tmp_path / "case.json"
    p.write_text(json.dumps(example_doc), encoding="utf-8")
    res = generate(p, template="judiciaire", out_dir=tmp_path / "out", case_root=tmp_path)
    assert "![Logo" in res.outputs["md"].read_text(encoding="utf-8")
    assert res.outputs["pdf"].stat().st_size > 0


def test_markdown_only_does_not_need_pdf(tmp_path, example_file):
    res = generate(example_file, template="entreprise", out_dir=tmp_path / "o", formats=("md",))
    assert set(res.outputs) == {"md"}
