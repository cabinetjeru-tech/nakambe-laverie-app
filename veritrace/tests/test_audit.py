import json
import os
import stat

from veritrace.core.audit import GENESIS_HASH, AuditLog


def test_append_and_verify(tmp_path):
    log = AuditLog(tmp_path / "audit.jsonl", examiner="E")
    first = log.append("a", {"x": 1})
    log.append("b")
    assert first["prev_hash"] == GENESIS_HASH
    res = log.verify()
    assert res.ok and res.entries == 2
    assert not os.stat(log.path).st_mode & stat.S_IWUSR, "le journal doit rester en lecture seule"


def _rewrite(path, lines):
    os.chmod(path, 0o644)
    path.write_text("".join(json.dumps(l) + "\n" for l in lines))


def test_detects_modification(tmp_path):
    log = AuditLog(tmp_path / "audit.jsonl")
    for i in range(3):
        log.append("act", {"i": i})
    lines = [json.loads(l) for l in log.path.read_text().splitlines()]
    lines[1]["details"]["i"] = 99
    _rewrite(log.path, lines)
    res = log.verify()
    assert not res.ok and any("modifié" in p for p in res.problems)


def test_detects_deletion(tmp_path):
    log = AuditLog(tmp_path / "audit.jsonl")
    for i in range(3):
        log.append("act", {"i": i})
    lines = [json.loads(l) for l in log.path.read_text().splitlines()]
    _rewrite(log.path, [lines[0], lines[2]])
    assert not log.verify().ok


def test_append_after_reopen_continues_chain(tmp_path):
    AuditLog(tmp_path / "a.jsonl").append("one")
    e = AuditLog(tmp_path / "a.jsonl").append("two")
    assert e["seq"] == 2
    assert AuditLog(tmp_path / "a.jsonl").verify().ok
