import json

import click
from click.testing import CliRunner

from veritrace.cli import cli
from veritrace.core.audit import AuditLog

from conftest import AUTH_INPUT


def _leaf_commands(group: click.Group, prefix=""):
    for name, cmd in group.commands.items():
        if isinstance(cmd, click.Group):
            yield from _leaf_commands(cmd, f"{prefix}{name} ")
        else:
            yield f"{prefix}{name}", cmd


def test_every_command_is_guarded():
    unguarded = [n for n, c in _leaf_commands(cli) if not getattr(c.callback, "__veritrace_guarded__", False)]
    assert not unguarded, f"Commandes sans garde-fou d'autorisation : {unguarded}"


def test_version_without_prompt():
    r = CliRunner().invoke(cli, ["--version"])
    assert r.exit_code == 0 and "Nourou Chafikou" in r.output


def test_subcommand_help_without_prompt():
    r = CliRunner().invoke(cli, ["report", "--help"], input="")
    assert r.exit_code == 0 and "Nom de l'examinateur" not in r.output


def test_refused_authorization_blocks(tmp_path, isolated_home):
    r = CliRunner().invoke(cli, ["case", "init", str(tmp_path / "c"), "--case-id", "X", "--title", "t",
                                 "--org-name", "o"], input="E\nmandat\nR\nnon\n")
    assert r.exit_code == 3
    assert not (tmp_path / "c").exists()
    assert not (isolated_home / "audit.jsonl").exists()


def test_eof_blocks():
    r = CliRunner().invoke(cli, ["doctor"], input="")
    assert r.exit_code == 3


def test_end_to_end_case_and_reports(tmp_path, isolated_home):
    runner = CliRunner()
    case_dir = tmp_path / "VT-1"
    r = runner.invoke(cli, ["case", "init", str(case_dir), "--case-id", "VT-1", "--title", "Essai",
                            "--org-name", "Cabinet Test", "--tz", "Africa/Ouagadougou"], input=AUTH_INPUT)
    assert r.exit_code == 0, r.output
    for d in ("normalized", "acquisition/raw", "parsed", "reports", "audit", "custody/documents"):
        assert (case_dir / d).is_dir()

    for tpl in ("judiciaire", "entreprise"):
        r = runner.invoke(cli, ["report", "--case", str(case_dir), "--report", tpl], input=AUTH_INPUT)
        assert r.exit_code == 0, r.output
    assert len(list((case_dir / "reports").glob("*.pdf"))) == 2

    audit = AuditLog(case_dir / "audit" / "audit.jsonl")
    assert audit.verify().ok
    actions = [e["action"] for e in audit.entries()]
    assert actions.count("report_generated") == 2
    assert "authorization_confirmed" in actions
    assert AuditLog(isolated_home / "audit.jsonl").verify().ok

    doc = json.loads((case_dir / "normalized" / "veritrace_case.json").read_text(encoding="utf-8"))
    assert doc["x_veritrace"]["integrity"]["audit"]["verified"] is True


def test_schema_validate_command(tmp_path, example_doc):
    p = tmp_path / "x.json"
    example_doc["findings"][0]["artifact_ids"] = ["NOPE"]
    p.write_text(json.dumps(example_doc), encoding="utf-8")
    r = CliRunner().invoke(cli, ["schema", "validate", str(p)], input=AUTH_INPUT)
    assert r.exit_code == 1 and "NOPE" in r.output
