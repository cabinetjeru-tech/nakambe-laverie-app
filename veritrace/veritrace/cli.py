"""Interface en ligne de commande `veritrace`.

Ordre d'exécution de toute commande :
  bannière → confirmation bloquante d'autorisation légale → audit → commande.
Seuls `--help` et `--version` s'affichent sans confirmation (aucune action sur des données).
"""
from __future__ import annotations

import functools
import json
import os
import sys
from pathlib import Path

import click

from veritrace import __author__, __version__
from veritrace.banner import print_banner
from veritrace.core.audit import AuditLog
from veritrace.core.authorization import AuthorizationRecord, require_authorization
from veritrace.core.case import Case, CaseError
from veritrace.core.logging_setup import get_logger, setup_logging
from veritrace.core.tools import detect_all
from veritrace.reporting import FORMATS, generate
from veritrace.reporting.model import TEMPLATES, ReportPrecheckError
from veritrace.schema.validator import SCHEMA_PATH, CaseValidationError, validate_file

log = get_logger("cli")


def veritrace_home() -> Path:
    return Path(os.environ.get("VERITRACE_HOME") or Path.home() / ".veritrace")


def global_audit(examiner: str | None = None) -> AuditLog:
    """Journal d'audit du poste : trace les sessions, y compris hors affaire."""
    return AuditLog(veritrace_home() / "audit.jsonl", examiner=examiner)


class Ctx:
    def __init__(self, auth: AuthorizationRecord) -> None:
        self.auth = auth
        self.audit = global_audit(auth.examiner)


def _session(ctx: click.Context) -> Ctx:
    """Exige l'autorisation légale une fois par processus, au moment d'exécuter une commande.

    Placé ici (et non dans le callback du groupe) pour que `veritrace <cmd> --help` reste
    consultable sans confirmation : Click traite --help avant d'invoquer la commande.
    """
    root = ctx.find_root()
    if root.obj is None:
        auth = require_authorization()
        root.obj = Ctx(auth)
        root.obj.audit.append("authorization_confirmed", auth.as_dict())
        root.obj.audit.append("command_invoked", {"argv": sys.argv[1:], "cwd": os.getcwd()})
    return root.obj


def pass_ctx(f):
    """Décorateur OBLIGATOIRE sur chaque commande : déclenche le garde-fou d'autorisation."""
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        return f(_session(click.get_current_context()), *args, **kwargs)
    wrapper.__veritrace_guarded__ = True  # vérifié par les tests : aucune commande sans garde-fou
    return wrapper


# --------------------------------------------------------------------------- groupe racine
@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(__version__, "-V", "--version", prog_name="Veritrace",
                      message=f"%(prog)s %(version)s — développé par {__author__}")
@click.option("-v", "--verbose", is_flag=True, help="Logs détaillés (DEBUG).")
def cli(verbose: bool) -> None:
    """Veritrace — forensique Android pour examens légalement autorisés.

    Acquisition logique ADB, parsing (ALEAPP, MVT, Autopsy, SQLite), corrélation et
    rapports judiciaire / entreprise depuis un JSON normalisé unique.

    Toute commande exige au préalable la confirmation de l'autorisation légale.
    """
    setup_logging(verbose)
    print_banner()


def main() -> None:
    cli(prog_name="veritrace")


# --------------------------------------------------------------------------- doctor
@cli.command()
@pass_ctx
def doctor(c: Ctx) -> None:
    """Vérifie la présence et la version des outils externes (ADB, ALEAPP, MVT, Autopsy)."""
    statuses = detect_all()
    for s in statuses:
        if s.available:
            click.secho(f"  ✔ {s.label:<28} {s.version or '(version non lue)'}", fg="green")
            click.echo(f"      {s.path}")
        else:
            click.secho(f"  ✖ {s.label:<28} ABSENT — {s.purpose}", fg="yellow")
    missing = [s.label for s in statuses if not s.available]
    if missing:
        click.secho(f"\n{len(missing)} outil(s) absent(s) : les étapes correspondantes seront ignorées "
                    "(avertissement, pas d'arrêt). Voir README § Installation.", fg="yellow")
    c.audit.append("doctor", {s.key: {"available": s.available, "version": s.version} for s in statuses})


# --------------------------------------------------------------------------- schema
@cli.group()
def schema() -> None:
    """Contrat de données : validation, exemple, emplacement du schéma."""


@schema.command("validate")
@click.argument("json_file", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--case-root", type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Racine de l'affaire : re-hache les preuves sur disque.")
@pass_ctx
def schema_validate(c: Ctx, json_file: Path, case_root: Path | None) -> None:
    """Valide JSON_FILE (structure + cohérence sémantique)."""
    report = validate_file(json_file, case_root=case_root)
    for issue in report.issues:
        click.secho(str(issue), fg="red" if issue.level == "error" else "yellow")
    c.audit.append("schema_validated", {"file": str(json_file.resolve()), "ok": report.ok,
                                        "errors": len(report.errors), "warnings": len(report.warnings)})
    if report.ok:
        click.secho(f"✔ Conforme ({len(report.warnings)} avertissement(s)).", fg="green")
    else:
        click.secho(f"✖ Non conforme : {len(report.errors)} erreur(s).", fg="red")
        sys.exit(1)


@schema.command("example")
@click.option("-o", "--output", type=click.Path(dir_okay=False, path_type=Path),
              help="Fichier de sortie (défaut : stdout).")
@pass_ctx
def schema_example(c: Ctx, output: Path | None) -> None:
    """Écrit le document d'exemple (affaire fictive) conforme au schéma."""
    from veritrace.schema.example import example_json

    text = example_json()
    if output:
        output.write_text(text, encoding="utf-8")
        click.echo(f"Exemple écrit dans {output}")
    else:
        click.echo(text, nl=False)
    c.audit.append("schema_example_written", {"output": str(output) if output else "stdout"})


@schema.command("path")
@pass_ctx
def schema_path(c: Ctx) -> None:
    """Affiche le chemin du fichier de schéma utilisé."""
    click.echo(os.environ.get("VERITRACE_SCHEMA") or SCHEMA_PATH)


# --------------------------------------------------------------------------- case
@cli.group()
def case() -> None:
    """Gestion du dossier d'affaire normalisé."""


@case.command("init")
@click.argument("directory", type=click.Path(file_okay=False, path_type=Path))
@click.option("--case-id", required=True, help="Référence de l'affaire (ex. VT-2026-0042).")
@click.option("--title", required=True, help="Intitulé de l'affaire.")
@click.option("--org-name", required=True, help="Nom du cabinet (page de garde).")
@click.option("--org-address", default="", help="Adresse du cabinet.")
@click.option("--org-phone", default="", help="Téléphone du cabinet.")
@click.option("--org-email", default="", help="E-mail du cabinet.")
@click.option("--logo", type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="Logo du cabinet (PNG/JPG), copié dans assets/.")
@click.option("--report-type", type=click.Choice(TEMPLATES), default="judiciaire", show_default=True)
@click.option("--tz", "display_tz", default="UTC", show_default=True,
              help="Fuseau d'affichage des rapports (ex. Africa/Ouagadougou).")
@pass_ctx
def case_init(c: Ctx, directory: Path, case_id: str, title: str, org_name: str, org_address: str,
              org_phone: str, org_email: str, logo: Path | None, report_type: str, display_tz: str) -> None:
    """Crée l'arborescence d'une nouvelle affaire dans DIRECTORY."""
    org = {"name": org_name, "address": org_address, "phone": org_phone, "email": org_email, "logo_path": None}
    org = {k: v for k, v in org.items() if v or k in ("name", "logo_path")}
    if logo:
        dest = directory / "assets" / f"logo{logo.suffix.lower()}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(logo.read_bytes())
        org["logo_path"] = f"assets/{dest.name}"
    try:
        new = Case.create(directory, case_id=case_id, title=title, auth=c.auth, organization=org,
                          report_type=report_type, display_timezone=display_tz)
    except (CaseError, CaseValidationError) as exc:
        raise click.ClickException(str(exc)) from exc
    c.audit.append("case_created", {"case_id": case_id, "root": str(new.root)})
    click.secho(f"✔ Affaire {case_id} créée : {new.root}", fg="green")


@case.command("info")
@click.argument("directory", type=click.Path(exists=True, file_okay=False, path_type=Path))
@pass_ctx
def case_info(c: Ctx, directory: Path) -> None:
    """Résumé d'une affaire : volumes, état de l'audit."""
    try:
        k = Case.open(directory, c.auth)
    except CaseError as exc:
        raise click.ClickException(str(exc)) from exc
    doc = k.load()
    v = k.audit.verify()
    click.echo(f"Affaire     : {doc['case']['case_id']} — {doc['case']['title']}")
    for key in ("devices", "acquisitions", "evidence_items", "custody_chain", "tool_runs", "artifacts",
                "timeline", "findings"):
        click.echo(f"  {key:<15} {len(doc[key])}")
    click.secho(f"Audit       : {v.entries} entrées, chaîne {'intègre' if v.ok else 'ROMPUE'}",
                fg="green" if v.ok else "red")


# --------------------------------------------------------------------------- audit
@cli.group()
def audit() -> None:
    """Journal d'audit : vérification et consultation (lecture seule)."""


def _audit_for(case_dir: Path | None, c: Ctx) -> AuditLog:
    if case_dir:
        return AuditLog(case_dir / "audit" / "audit.jsonl")
    return c.audit


@audit.command("verify")
@click.option("--case", "case_dir", type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Dossier d'affaire (défaut : journal global du poste).")
@pass_ctx
def audit_verify(c: Ctx, case_dir: Path | None) -> None:
    """Vérifie la chaîne d'empreintes du journal d'audit."""
    log_ = _audit_for(case_dir, c)
    res = log_.verify()
    c.audit.append("audit_verified", {"file": str(log_.path), "ok": res.ok, "entries": res.entries})
    if res.ok:
        click.secho(f"✔ {log_.path} : {res.entries} entrées, chaîne intègre.\n  Tête : {res.head_hash}",
                    fg="green")
    else:
        for p in res.problems:
            click.secho(f"  ✖ {p}", fg="red")
        sys.exit(1)


@audit.command("show")
@click.option("--case", "case_dir", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option("-n", "--last", default=20, show_default=True, help="Nombre d'entrées affichées.")
@pass_ctx
def audit_show(c: Ctx, case_dir: Path | None, last: int) -> None:
    """Affiche les dernières entrées du journal."""
    entries = list(_audit_for(case_dir, c).entries())[-last:]
    for e in entries:
        click.echo(f"#{e['seq']:>5} {e['timestamp']}  {e['examiner']:<20} {e['action']:<24} "
                   f"{json.dumps(e['details'], ensure_ascii=False)[:100]}")


# --------------------------------------------------------------------------- parse / correlate
def _open_case(c: Ctx, case_dir: Path) -> Case:
    try:
        return Case.open(case_dir, c.auth)
    except CaseError as exc:
        raise click.ClickException(str(exc)) from exc


def _print_outcome(label: str, o) -> None:
    color = {"success": "green", "skipped": "yellow", "failed": "red"}[o.status]
    click.secho(f"{'✔' if o.status == 'success' else '⚠' if o.status == 'skipped' else '✖'} {label} "
                f"[{o.run_id}] {o.status}", fg=color)
    if o.status == "success":
        click.echo(f"    {o.artifacts_added} artefact(s) ajouté(s), {o.findings_added} constat(s) ; "
                   f"faits uniques : {o.correlation.get('facts')}, corroborés : {o.correlation.get('corroborated_facts')}, "
                   f"doublons inter-outils fusionnés : {o.correlation.get('merged_duplicates')}")
    click.echo(f"    {o.message}")


def _run(c: Ctx, case_dir: Path, wrapper, extraction: Path, options: dict, **kw):
    from veritrace.core.evidence import IntegrityError
    from veritrace.parsing.runner import run_wrapper

    k = _open_case(c, case_dir)
    try:
        return run_wrapper(k, wrapper, extraction, options, **kw)
    except (IntegrityError, FileNotFoundError) as exc:
        raise click.ClickException(str(exc)) from exc
    except CaseValidationError as exc:
        raise click.ClickException(f"Résultat non conforme au schéma — rien n'a été enregistré.\n{exc}") from exc


_case_opt = click.option("--case", "case_dir", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path),
                         help="Dossier d'affaire.")
_input_opt = click.option("--input", "extraction", required=True, type=click.Path(exists=True, path_type=Path),
                          help="Chemin de l'extraction (dossier, .tar/.zip, sauvegarde .ab, bundle AndroidQF…).")


@cli.group()
def parse() -> None:
    """Analyse d'une extraction par ALEAPP, MVT, Autopsy (résultats normalisés + corrélation)."""


@parse.command("aleapp")
@_case_opt
@_input_opt
@click.option("--from-output", type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Importer un rapport ALEAPP existant au lieu de lancer ALEAPP.")
@click.option("--input-type", type=click.Choice(["fs", "tar", "zip", "gz", "raw"]), help="Forcer le type d'entrée.")
@click.option("--timeout", default=4 * 3600, show_default=True, help="Délai maximal (s).")
@pass_ctx
def parse_aleapp(c: Ctx, case_dir: Path, extraction: Path, from_output: Path | None, input_type: str | None,
                 timeout: int) -> None:
    """Parsing complet de l'extraction logique par ALEAPP."""
    from veritrace.parsing.aleapp import AleappWrapper

    o = _run(c, case_dir, AleappWrapper(), extraction,
             {"from_output": from_output, "input_type": input_type, "timeout": timeout})
    _print_outcome("ALEAPP", o)


@parse.command("mvt")
@_case_opt
@_input_opt
@click.option("--iocs", "iocs", multiple=True, type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="Fichier d'IOC STIX2 (option répétable).")
@click.option("--mode", type=click.Choice(["androidqf", "backup", "bugreport"]), help="Forcer le mode MVT.")
@click.option("--from-output", type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Importer des résultats MVT existants au lieu de lancer MVT.")
@click.option("--timeout", default=3600, show_default=True, help="Délai maximal (s).")
@pass_ctx
def parse_mvt(c: Ctx, case_dir: Path, extraction: Path, iocs: tuple[Path, ...], mode: str | None,
              from_output: Path | None, timeout: int) -> None:
    """Détection spyware/stalkerware par MVT (IOC STIX2)."""
    from veritrace.parsing.mvt import MvtWrapper

    o = _run(c, case_dir, MvtWrapper(), extraction,
             {"iocs": list(iocs), "mode": mode, "from_output": from_output, "timeout": timeout})
    _print_outcome("MVT", o)


@parse.command("autopsy")
@_case_opt
@click.option("--input", "autopsy_case", required=True, type=click.Path(exists=True, path_type=Path),
              help="Dossier de cas Autopsy, Portable Case, fichier .aut ou autopsy.db.")
@click.option("--module", "modules", multiple=True,
              help="Motif de module Autopsy à retenir (défaut : android, aleapp). Répétable.")
@click.option("--autopsy-version", help="Version d'Autopsy ayant produit le cas (consignée dans le rapport).")
@pass_ctx
def parse_autopsy(c: Ctx, case_dir: Path, autopsy_case: Path, modules: tuple[str, ...],
                  autopsy_version: str | None) -> None:
    """Intègre le résultat de l'ingest Autopsy (artefacts du module Android)."""
    from veritrace.parsing.autopsy import AutopsyWrapper, find_case_db
    from veritrace.parsing.base import ToolFailed

    try:
        db = find_case_db(autopsy_case)
    except ToolFailed as exc:
        raise click.ClickException(str(exc)) from exc
    o = _run(c, case_dir, AutopsyWrapper(), autopsy_case,
             {"modules": list(modules) or None, "version": autopsy_version},
             evidence_path=db, evidence_label=f"Base de cas Autopsy ({db.parent.name}/{db.name})",
             evidence_type="tool_output")
    _print_outcome("Autopsy", o)


@parse.command("all")
@_case_opt
@_input_opt
@click.option("--iocs", "iocs", multiple=True, type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="Fichier(s) d'IOC STIX2 pour MVT.")
@click.option("--mvt-input", type=click.Path(exists=True, path_type=Path),
              help="Entrée spécifique pour MVT (bundle AndroidQF, .ab, bugreport) si différente.")
@click.option("--autopsy-case", type=click.Path(exists=True, path_type=Path), help="Cas Autopsy à intégrer.")
@pass_ctx
def parse_all(c: Ctx, case_dir: Path, extraction: Path, iocs: tuple[Path, ...], mvt_input: Path | None,
              autopsy_case: Path | None) -> None:
    """Enchaîne ALEAPP, MVT et (si fourni) Autopsy ; un outil absent est ignoré."""
    from veritrace.parsing.aleapp import AleappWrapper
    from veritrace.parsing.autopsy import AutopsyWrapper, find_case_db
    from veritrace.parsing.mvt import MvtWrapper

    _print_outcome("ALEAPP", _run(c, case_dir, AleappWrapper(), extraction, {}))
    _print_outcome("MVT", _run(c, case_dir, MvtWrapper(), mvt_input or extraction, {"iocs": list(iocs)}))
    if autopsy_case:
        db = find_case_db(autopsy_case)
        _print_outcome("Autopsy", _run(c, case_dir, AutopsyWrapper(), autopsy_case, {}, evidence_path=db,
                                       evidence_label=f"Base de cas Autopsy ({db.name})", evidence_type="tool_output"))
    else:
        click.echo("  Autopsy : aucun cas fourni (--autopsy-case) — étape non exécutée.")


@cli.command()
@_case_opt
@pass_ctx
def correlate(c: Ctx, case_dir: Path) -> None:
    """Recalcule corroboration, dédoublonnage et timeline de l'affaire."""
    from veritrace.parsing.runner import run_correlation

    s = run_correlation(_open_case(c, case_dir))
    click.secho(f"✔ {s['artifacts']} artefact(s) → {s['facts']} fait(s) unique(s) ; {s['corroborated_facts']} "
                f"corroboré(s) ; {s['merged_duplicates']} doublon(s) inter-outils ; {s['timeline_events']} "
                "événement(s) de timeline.", fg="green")


# --------------------------------------------------------------------------- report
@cli.command()
@click.option("--case", "case_dir", type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Dossier d'affaire (lit normalized/veritrace_case.json, écrit dans reports/).")
@click.option("--input", "input_json", type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="JSON normalisé autonome (alternative à --case).")
@click.option("--report", "template", type=click.Choice(TEMPLATES), default=None,
              help="Gabarit : judiciaire ou entreprise (défaut : case.report_type).")
@click.option("--format", "formats", default="md,pdf", show_default=True,
              help="Formats séparés par des virgules : md, pdf.")
@click.option("-o", "--out", "out_dir", type=click.Path(file_okay=False, path_type=Path),
              help="Dossier de sortie (défaut : <affaire>/reports ou ./reports).")
@click.option("--verify-files", is_flag=True, help="Re-hache chaque preuve sur disque avant le rapport.")
@pass_ctx
def report(c: Ctx, case_dir: Path | None, input_json: Path | None, template: str | None, formats: str,
           out_dir: Path | None, verify_files: bool) -> None:
    """Génère le rapport (Markdown et/ou PDF) depuis le JSON normalisé."""
    if bool(case_dir) == bool(input_json):
        raise click.UsageError("Indiquez soit --case, soit --input.")
    fmts = tuple(f.strip().lower() for f in formats.split(",") if f.strip())
    bad = set(fmts) - set(FORMATS)
    if bad or not fmts:
        raise click.UsageError(f"Format(s) invalide(s) : {', '.join(sorted(bad)) or '(vide)'}")

    audit_log, root = c.audit, None
    if case_dir:
        try:
            k = Case.open(case_dir, c.auth)
            doc = k.load()
            k.save(doc, reason="pre_report_integrity_refresh")  # consigne l'état de l'audit dans le JSON
        except (CaseError, CaseValidationError) as exc:
            raise click.ClickException(str(exc)) from exc
        source, root, audit_log = k.data_path, k.root, k.audit
        out_dir = out_dir or k.root / "reports"
    else:
        source = input_json
        out_dir = out_dir or Path("reports")
        doc = json.loads(source.read_text(encoding="utf-8"))
        root = source.parent

    tpl = template or (doc.get("case") or {}).get("report_type") or "judiciaire"
    try:
        result = generate(source, template=tpl, out_dir=out_dir, formats=fmts, case_root=root,
                          verify_files=verify_files)
    except CaseValidationError as exc:
        audit_log.append("report_refused", {"source": str(source), "errors": len(exc.report.errors)})
        raise click.ClickException(f"Rapport refusé — {exc}") from exc
    except ReportPrecheckError as exc:
        audit_log.append("report_refused", {"source": str(source), "template": tpl, "reason": str(exc)})
        raise click.ClickException(f"Rapport refusé — {exc}") from exc

    details = {"template": tpl, "source": str(source), "source_sha256": result.source_sha256,
               "outputs": {f: {"path": str(p), "sha256": result.output_sha256[f]} for f, p in result.outputs.items()}}
    audit_log.append("report_generated", details)
    if audit_log is not c.audit:
        c.audit.append("report_generated", details)
    for f, p in result.outputs.items():
        click.secho(f"✔ {f.upper():<3} {p}", fg="green")
        click.echo(f"      SHA-256 {result.output_sha256[f]}")
    click.echo(f"  Manifeste : {result.manifest}")


if __name__ == "__main__":
    main()
