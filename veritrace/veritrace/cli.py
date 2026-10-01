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
    from veritrace.schema.pivot import iter_items, tool_runs

    dev = doc["device"]
    click.echo(f"Appareil    : {dev.get('manufacturer') or '—'} {dev.get('model') or ''} (n° {dev.get('serial') or '—'})")
    counts = {"acquisitions": len(doc["acquisitions"]), "éléments de preuve": sum(1 for _ in iter_items(doc)),
              "chaîne de custody": len(doc["chain_of_custody"]), "exécutions d'outils": len(tool_runs(doc)),
              "artefacts": len(doc["artifacts"]), "timeline": len(doc["timeline"]), "constats": len(doc["findings"])}
    for key, n in counts.items():
        click.echo(f"  {key:<20} {n}")
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


# --------------------------------------------------------------------------- acquisition
@cli.group()
def acquire() -> None:
    """Acquisition logique via ADB (appareil déverrouillé par son titulaire, débogage USB autorisé)."""


def _adb_or_fail(c: Ctx):
    from veritrace.acquisition.adb import Adb
    from veritrace.core.tools import detect

    status = detect("adb")
    if not status.available:
        click.secho(f"⚠ {status.message}", fg="yellow", err=True)
        click.echo("  Installer Android SDK Platform-Tools (voir README § Installation) puis relancer.", err=True)
        c.audit.append("acquisition_impossible", {"reason": status.message})
        sys.exit(1)
    return Adb(status.path), status.version


@acquire.command("devices")
@pass_ctx
def acquire_devices(c: Ctx) -> None:
    """Liste les appareils vus par ADB et leur état."""
    from veritrace.acquisition.adb import AdbError

    adb, _ = _adb_or_fail(c)
    try:
        devs = adb.devices()
    except AdbError as exc:
        raise click.ClickException(str(exc)) from exc
    if not devs:
        click.echo("Aucun appareil détecté.")
    for d in devs:
        click.secho(f"  {d.serial:<20} {d.state:<14} {d.attrs.get('model', '')}", fg="green" if d.ready else "yellow")
        if not d.ready:
            click.echo(f"      → {d.help}")
    c.audit.append("adb_devices_listed", {"devices": [{"serial": d.serial, "state": d.state} for d in devs]})


@acquire.command("run")
@click.option("--case", "case_dir", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Dossier d'affaire.")
@click.option("--serial", help="Numéro de série ADB de l'appareil (si plusieurs sont branchés).")
@click.option("--method", "methods", multiple=True,
              type=click.Choice(["packages", "dumpsys", "backup", "pull", "bugreport"]),
              help="Méthode(s) en plus de getprop (répétable). Défaut : packages, dumpsys, backup.")
@click.option("--path", "paths", multiple=True, help="Chemin à copier (méthode pull ; répétable). "
              "Défaut : /sdcard/DCIM, /sdcard/Pictures, /sdcard/Download, /sdcard/Documents.")
@click.option("--shared", is_flag=True, help="Inclure le stockage partagé dans la sauvegarde ADB.")
@click.option("--imei", multiple=True, help="IMEI relevé par l'examinateur (étiquette, *#06# affiché par le titulaire).")
@click.option("--owner", help="Titulaire de l'appareil.")
@click.option("--seal", "seal_number", help="Numéro de scellé.")
@click.option("--state", "state_on_receipt", help="État de l'appareil à réception.")
@pass_ctx
def acquire_run(c: Ctx, case_dir: Path, serial: str | None, methods: tuple[str, ...], paths: tuple[str, ...],
                shared: bool, imei: tuple[str, ...], owner: str | None, seal_number: str | None,
                state_on_receipt: str | None) -> None:
    """Acquisition logique : identification, puis collecte hachée avec chaîne de custody."""
    from veritrace.acquisition.adb import AdbError, DeviceNotReady
    from veritrace.acquisition.session import DEFAULT_METHODS, DEFAULT_PULL, AcquisitionSession, DeviceMeta

    adb, version = _adb_or_fail(c)
    k = _open_case(c, case_dir)
    try:
        dev = adb.select(serial)
        props, _ = adb.getprop()
    except DeviceNotReady as exc:
        k.audit.append("acquisition_refused", {"reason": str(exc)})
        raise click.ClickException(f"Acquisition impossible — {exc}\n  Veritrace ne contourne aucun "
                                   "verrouillage : seule une action du titulaire peut débloquer la situation.") from exc
    except AdbError as exc:
        raise click.ClickException(str(exc)) from exc

    click.secho("\nAppareil détecté :", bold=True)
    for label, key in (("Fabricant", "ro.product.manufacturer"), ("Modèle", "ro.product.model"),
                       ("Android", "ro.build.version.release"), ("Correctif sécurité", "ro.build.version.security_patch"),
                       ("N° de série", "ro.serialno")):
        click.echo(f"  {label:<20} {props.get(key, '—')}")
    auth = k.load()["case"]["authorization"]
    scope = (auth.get("x_veritrace") or {}).get("scope")
    click.echo(f"  Autorisation         {auth['type']} — réf. {auth['reference']}"
               + (f" — périmètre : {scope}" if scope else ""))
    answer = click.prompt("Cet appareil est-il bien celui visé par l'autorisation ? (oui/non)", err=True,
                          type=click.Choice(["oui", "o", "non", "n"], case_sensitive=False), default="non",
                          show_choices=False)
    if answer.lower() not in ("oui", "o"):
        k.audit.append("acquisition_aborted", {"serial": dev.serial, "reason": "appareil non confirmé par l'examinateur"})
        raise click.ClickException("Acquisition annulée : appareil non confirmé.")
    k.audit.append("device_confirmed", {"serial": dev.serial, "model": props.get("ro.product.model")})

    session = AcquisitionSession(k, adb, adb_version=version, notify=lambda m: click.secho(f"  ➜ {m}", fg="cyan"))
    results = [session.identify(dev, DeviceMeta(list(imei), owner, seal_number, state_on_receipt))]
    if results[0].status != "echec":
        for m in methods or DEFAULT_METHODS[1:]:
            if m == "backup":
                results.append(session.backup(shared=shared))
            elif m == "pull":
                results.append(session.pull(tuple(paths) or DEFAULT_PULL))
            else:
                results.append(getattr(session, m)())
    for r in results:
        color = {"succes": "green", "partiel": "yellow", "echec": "red"}[r.status]
        click.secho(f"{'✔' if r.status == 'succes' else '⚠' if r.status == 'partiel' else '✖'} {r.acquisition_id} "
                    f"{r.method:<10} {r.status:<8} éléments : {', '.join(r.item_ids) or '—'}", fg=color)
        for n in r.notes:
            click.echo(f"      {n}")


# --------------------------------------------------------------------------- parse / correlate
def _open_case(c: Ctx, case_dir: Path) -> Case:
    try:
        return Case.open(case_dir, c.auth)
    except CaseError as exc:
        raise click.ClickException(str(exc)) from exc


def _print_outcome(label: str, o) -> None:
    color = {"succes": "green", "ignore": "yellow", "echec": "red"}[o.status]
    click.secho(f"{'✔' if o.status == 'succes' else '⚠' if o.status == 'ignore' else '✖'} {label} "
                f"[{o.run_id}] {o.status}", fg=color)
    if o.status == "succes":
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
             evidence_type="sortie_outil")
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
                                       evidence_label=f"Base de cas Autopsy ({db.name})", evidence_type="sortie_outil"))
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
                f"événement(s) de timeline ; {s['rule_findings']} constat(s) des règles R1–R5.", fg="green")


# --------------------------------------------------------------------------- règles
@cli.group()
def rules() -> None:
    """Règles de détection d'anomalies (R1–R5) : liste, configuration, revue des constats."""


@rules.command("list")
@pass_ctx
def rules_list(c: Ctx) -> None:
    """Liste les règles et leurs paramètres par défaut."""
    from veritrace.correlation.rules import DEFAULTS, RULES, RULES_VERSION

    click.echo(f"Règles de détection Veritrace (version {RULES_VERSION}) :")
    for r in RULES:
        click.echo(f"  {r.rule_id}  {r.title}\n      {r.description}")
    click.echo("Paramètres par défaut : " + ", ".join(f"{k}={v:g}" for k, v in DEFAULTS.items()))


@rules.command("config")
@click.option("--case", "case_dir", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Dossier d'affaire.")
@click.option("--disable", multiple=True, help="Règle à désactiver (ex. R5). Répétable.")
@click.option("--enable", multiple=True, help="Règle à réactiver. Répétable.")
@click.option("--gap-hours", type=float, help="R5 : seuil minimal d'interruption (heures).")
@click.option("--future-tolerance-hours", type=float, help="R4 : tolérance au-delà de l'acquisition (heures).")
@click.option("--download-window-minutes", type=float, help="R3 : fenêtre téléchargement → installation (minutes).")
@pass_ctx
def rules_config(c: Ctx, case_dir: Path, disable: tuple[str, ...], enable: tuple[str, ...], gap_hours: float | None,
                 future_tolerance_hours: float | None, download_window_minutes: float | None) -> None:
    """Configure les règles pour l'affaire, puis relance la corrélation."""
    from veritrace.correlation.rules import RULES
    from veritrace.parsing.runner import run_correlation

    known = {r.rule_id for r in RULES}
    unknown = (set(disable) | set(enable)) - known
    if unknown:
        raise click.UsageError(f"Règle(s) inconnue(s) : {', '.join(sorted(unknown))}")
    k = _open_case(c, case_dir)
    doc = k.load()
    cfg = doc["case"].setdefault("x_veritrace", {}).setdefault("rules", {})
    cfg["disabled"] = sorted((set(cfg.get("disabled") or []) | set(disable)) - set(enable))
    for key, value in (("gap_hours", gap_hours), ("future_tolerance_hours", future_tolerance_hours),
                       ("download_window_minutes", download_window_minutes)):
        if value is not None:
            cfg[key] = value
    k.save(doc, reason="rules_config")
    k.audit.append("rules_configured", cfg)
    s = run_correlation(k)
    click.secho(f"✔ Configuration enregistrée ({cfg}). {s['rule_findings']} constat(s) produit(s) par les règles.",
                fg="green")


@rules.command("review")
@click.option("--case", "case_dir", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Dossier d'affaire.")
@click.argument("finding_id")
@click.option("--interpretation", help="Interprétation rédigée par l'examinateur (remplace le texte généré).")
@pass_ctx
def rules_review(c: Ctx, case_dir: Path, finding_id: str, interpretation: str | None) -> None:
    """Marque un constat (règle ou outil) comme revu par l'examinateur.

    Un constat de règle revu n'est plus régénéré ni supprimé ; dans les rapports, son
    interprétation est présentée comme celle de l'examinateur.
    """
    k = _open_case(c, case_dir)
    doc = k.load()
    f = next((f for f in doc["findings"] if f["finding_id"] == finding_id), None)
    if f is None:
        raise click.ClickException(f"{finding_id} : constat introuvable.")
    f.setdefault("x_veritrace", {})["reviewed"] = True
    if interpretation:
        f["x_veritrace"]["interpretation"] = interpretation
    k.save(doc, reason="finding_reviewed")
    k.audit.append("finding_reviewed", {"finding_id": finding_id, "interpretation_edited": bool(interpretation)})
    click.secho(f"✔ {finding_id} marqué comme revu par {c.auth.examiner}.", fg="green")


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
