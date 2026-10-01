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
    assert "Résumé exécutif" in ent and "Résumé exécutif" not in jud
    assert "plan de remédiation" in ent


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


def _md(doc, tpl, **kw):
    return render_markdown(build_report_model(doc, tpl, source_sha256="0" * 64, **kw))


def test_judiciaire_cover_has_case_examiner_dates_and_device(example_doc):
    model = build_report_model(example_doc, "judiciaire", source_sha256="0" * 64)
    meta = dict(model.cover.meta)
    assert meta["N° d'affaire"] == "VT-2026-0042"
    assert "Examinateur Exemple" in meta["Examinateur(s)"]
    for k in ("Ouverture de l'affaire", "Période des opérations", "Date du rapport"):
        assert meta[k] != "—"
    row = model.cover.devices.rows[0]
    assert row[0] == "Samsung" and "350000000000001" in row[2] and "Android 14" in row[3]


def test_judiciaire_required_sections(example_doc):
    md = _md(example_doc, "judiciaire")
    for title in ("Déclaration d'autorisation", "PV-CONS-2026-0042", "Outils utilisés et versions",
                  "Procédure d'acquisition", "Principe de non-altération", "Chaîne de custody",
                  "Constat n° 1", "Chronologie consolidée", "Annexe A", "Glossaire", "Attestation", "Signature"):
        assert title in md, title


def test_judiciaire_findings_separate_facts_and_interpretation(example_doc):
    md = _md(example_doc, "judiciaire")
    f = example_doc["findings"][0]
    facts = md.index("**Faits constatés**")
    interp = md.index("**Interprétation de l'examinateur**")
    assert facts < md.index(f["description"]) < interp < md.index(f["interpretation"])


def test_judiciaire_finding_traceable_to_hashed_evidence(example_doc):
    md = _md(example_doc, "judiciaire")
    ev_hash = example_doc["evidence_items"][0]["sha256"]
    section = md[md.index("Constat n° 1"):md.index("Constat n° 2")]
    assert ev_hash in section                         # empreinte de la preuve
    assert "packages.xml" in section                   # fichier source
    assert "PC-001" in section                         # capture / référence
    assert "14/08/2026" in section                     # horodatage (fuseau d'affichage)


def test_judiciaire_is_neutral_no_severity(example_doc):
    md = _md(example_doc, "judiciaire")
    assert "Criticité" not in md and "Critique" not in md and "Recommandation" not in md


def test_judiciaire_refuses_untraceable_finding(example_doc):
    from veritrace.reporting.model import ReportPrecheckError

    example_doc["findings"][2]["artifact_ids"] = []
    with pytest.raises(ReportPrecheckError):
        build_report_model(example_doc, "judiciaire", source_sha256="0" * 64)
    build_report_model(example_doc, "entreprise", source_sha256="0" * 64)  # toléré côté entreprise


def test_entreprise_structure_and_order(example_doc):
    md = _md(example_doc, "entreprise")
    order = ["Résumé exécutif", "Criticité des constats", "Recommandations et plan de remédiation",
             "Détails techniques", "Annexe — Preuves"]
    positions = [md.index(f"## {i}") if f"## {i}" in md else md.index(i) for i in order]
    assert positions == sorted(positions)
    summary = md[md.index("Résumé exécutif"):md.index("Criticité des constats")]
    assert example_doc["case"]["executive_summary"] in summary
    assert "Isoler l'appareil" in summary              # décisions immédiates
    assert "SHA-256" not in summary                    # non technique
    assert "CRITIQUE" in summary


def test_entreprise_remediation_sorted_by_priority(example_doc):
    from veritrace.reporting.model import PRIORITY_FR, _Ctx, _Fmt, _remediation_rows

    rows = _remediation_rows(_Ctx(example_doc, _Fmt("UTC"), "0" * 64, None))
    prios = [r[1] for r in rows]
    assert prios == sorted(prios, key=list(PRIORITY_FR.values()).index)
    assert len(rows) == 5


def test_screenshot_embedded_when_file_present(tmp_path, example_doc):
    PIL = pytest.importorskip("PIL.Image")
    shot = tmp_path / "parsed" / "exhibits" / "PC-001_parametres_applications.png"
    shot.parent.mkdir(parents=True)
    PIL.new("RGB", (300, 600), (240, 240, 240)).save(shot)
    md = _md(example_doc, "judiciaire", case_root=tmp_path)
    assert f"]({shot.as_posix()})" in md
    p = tmp_path / "c.json"
    p.write_text(json.dumps(example_doc), encoding="utf-8")
    res = generate(p, template="judiciaire", out_dir=tmp_path / "o", case_root=tmp_path)
    assert res.outputs["pdf"].stat().st_size > 0
