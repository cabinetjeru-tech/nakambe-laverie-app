"""Autotest de l'installation : chaîne complète sur des données FICTIVES.

Étapes (chacune chronométrée, résultat OK / ÉCHEC) :
  1. génération d'une extraction Android fictive et de bases avec enregistrements supprimés ;
  2. création d'une affaire ;
  3. parseurs natifs (données actives) ;
  4. récupération des enregistrements supprimés ;
  5. corrélation et règles R1–R6 ;
  6. validation du JSON pivot (avec re-hachage des preuves) ;
  7. rapports judiciaire et entreprise, PDF + Markdown ;
  8. vérification de la chaîne du journal d'audit.

Aucun outil externe n'est requis. Rien n'est écrit hors du dossier de travail (temporaire,
supprimé en fin d'autotest, sauf --keep).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from veritrace.core.authorization import AuthorizationRecord


@dataclass
class Step:
    name: str
    ok: bool
    seconds: float
    detail: str = ""


@dataclass
class SelftestResult:
    steps: list[Step] = field(default_factory=list)
    workdir: Path | None = None

    @property
    def ok(self) -> bool:
        return bool(self.steps) and all(s.ok for s in self.steps)


def run_selftest(workdir: Path, auth: AuthorizationRecord,
                 on_step: Callable[[Step], None] | None = None) -> SelftestResult:
    from veritrace.core.case import Case
    from veritrace.demo.android_fs import build_android_fs, build_dumpsys
    from veritrace.demo.deleted import build_deleted_fs
    from veritrace.parsing.recover import RecoverWrapper
    from veritrace.parsing.runner import run_correlation, run_wrapper
    from veritrace.parsing.sqlite_native import SqliteNativeWrapper
    from veritrace.reporting import generate
    from veritrace.schema.validator import validate_file

    res = SelftestResult(workdir=workdir)
    state: dict[str, Any] = {}

    def step(name: str, fn: Callable[[], str]) -> bool:
        t = time.monotonic()
        try:
            detail, ok = fn(), True
        except Exception as exc:  # l'autotest rapporte l'erreur au lieu de s'arrêter net
            detail, ok = f"{type(exc).__name__} : {exc}", False
        s = Step(name, ok, time.monotonic() - t, detail)
        res.steps.append(s)
        if on_step:
            on_step(s)
        return ok

    def gen() -> str:
        state["fs"] = build_android_fs(workdir / "extraction")
        state["dumpsys"] = build_dumpsys(workdir / "dumpsys")
        state["deleted"] = build_deleted_fs(workdir / "extraction_supprimes")
        return "extraction fictive, dumpsys, bases avec suppressions"

    def init() -> str:
        state["case"] = Case.create(workdir / "VT-AUTOTEST", case_id="VT-AUTOTEST", title="Autotest Veritrace",
                                    auth=auth, organization={"name": "Autotest", "logo_path": None},
                                    report_type="judiciaire", display_timezone="UTC")
        return str(state["case"].root)

    def native() -> str:
        n = 0
        for src in (state["fs"], state["dumpsys"], state["deleted"]):
            o = run_wrapper(state["case"], SqliteNativeWrapper(), src)
            if o.status != "succes":
                raise RuntimeError(o.message)
            n += o.artifacts_added
        return f"{n} artefact(s)"

    def recover() -> str:
        o = run_wrapper(state["case"], RecoverWrapper(), state["deleted"])
        if o.status != "succes" or not o.artifacts_added:
            raise RuntimeError(f"aucun enregistrement récupéré ({o.message})")
        return f"{o.artifacts_added} enregistrement(s) récupéré(s)"

    def correlate() -> str:
        s = run_correlation(state["case"])
        return f"{s['facts']} fait(s), {s['rule_findings']} constat(s) des règles"

    def validate() -> str:
        rep = validate_file(state["case"].data_path, case_root=state["case"].root)
        if not rep.ok:
            raise RuntimeError("; ".join(i.message for i in rep.errors[:3]))
        return "JSON pivot conforme, preuves re-hachées"

    def reports() -> str:
        k = state["case"]
        k.save(k.load(), reason="selftest_pre_report")
        out = []
        for tpl in ("judiciaire", "entreprise"):
            r = generate(k.data_path, template=tpl, out_dir=k.root / "reports", formats=("pdf", "md"),
                         case_root=k.root, verify_files=True)
            out += [p.name for p in r.outputs.values()]
        return ", ".join(out)

    def audit() -> str:
        v = state["case"].audit.verify()
        if not v.ok:
            raise RuntimeError("chaîne du journal d'audit rompue")
        return f"{v.entries} entrée(s), chaîne intègre"

    for name, fn in (("Génération des données fictives", gen), ("Création de l'affaire", init),
                     ("Parseurs natifs (données actives)", native), ("Récupération des supprimés", recover),
                     ("Corrélation et règles R1–R6", correlate), ("Validation du format pivot", validate),
                     ("Rapports PDF + Markdown", reports), ("Journal d'audit", audit)):
        if not step(name, fn):
            break
    return res
