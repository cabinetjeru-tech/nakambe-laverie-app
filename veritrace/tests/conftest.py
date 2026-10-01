import copy

import pytest

from veritrace.schema.example import build_example

AUTH_INPUT = "Examinateur Test\nconsentement\nPV-TEST-001\nAUTORISATION VERIFIEE\n"


@pytest.fixture
def example_doc():
    return copy.deepcopy(build_example())


@pytest.fixture(autouse=True)
def isolated_home(tmp_path, monkeypatch):
    """Le journal d'audit global ne doit jamais toucher le vrai ~/.veritrace pendant les tests,
    et la détection des outils ne doit pas trouver ceux du poste (ex. SDK Android du runner macOS)."""
    home = tmp_path / "vthome"
    monkeypatch.setenv("VERITRACE_HOME", str(home))
    user = tmp_path / "userhome"
    user.mkdir()
    for var in ("HOME", "USERPROFILE"):
        monkeypatch.setenv(var, str(user))
    for var in ("LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"):
        monkeypatch.delenv(var, raising=False)
    return home


@pytest.fixture(autouse=True)
def cli_tracebacks(monkeypatch):
    """Une exception inattendue dans une commande doit échouer avec sa trace complète
    (CliRunner la masque sinon dans `result.exception`)."""
    from click.testing import CliRunner

    original = CliRunner.invoke

    def invoke(self, *args, **kwargs):
        kwargs.setdefault("catch_exceptions", False)
        return original(self, *args, **kwargs)

    monkeypatch.setattr(CliRunner, "invoke", invoke)
