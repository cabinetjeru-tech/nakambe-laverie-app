import copy

import pytest

from veritrace.schema.example import build_example

AUTH_INPUT = "Examinateur Test\nconsentement\nPV-TEST-001\nAUTORISATION VERIFIEE\n"


@pytest.fixture
def example_doc():
    return copy.deepcopy(build_example())


@pytest.fixture(autouse=True)
def isolated_home(tmp_path, monkeypatch):
    """Le journal d'audit global ne doit jamais toucher le vrai ~/.veritrace pendant les tests."""
    home = tmp_path / "vthome"
    monkeypatch.setenv("VERITRACE_HOME", str(home))
    return home
