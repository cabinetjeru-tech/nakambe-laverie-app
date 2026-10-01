"""Wrapper MVT (Mobile Verification Toolkit) — détection spyware / stalkerware par IOC.

Exécution : `mvt-android check-{androidqf|backup|bugreport} -n -o <sortie> [-i iocs.stix2 …] <extraction>`
(mode détecté automatiquement, forçable par `mode=`). Les vérifications de mise à jour
réseau de MVT sont désactivées : l'analyse ne dépend que des IOC fournis.
Import : `--from-output` sur un dossier de résultats MVT existant.

Fichiers d'IOC (STIX2) : validés (bundle JSON STIX contenant des `indicator`), copiés
dans `custody/iocs/`, hachés et enregistrés comme éléments de preuve : le rapport
indique précisément quels indicateurs ont été utilisés.

Normalisation :
- `alerts.json` (MVT ≥ 2025) ou, à défaut, `*_detected.json` (versions antérieures) ;
- chaque alerte portant un `matched_indicator` → artefact `ioc_match` + **constat de
  criticité « critique » (alerte MVT CRITICAL) ou « élevé » (toute autre détection IOC)** ;
- alertes heuristiques sans IOC (ex. application installée hors magasin) de niveau
  MEDIUM ou plus → constat « suspicious_app » / « anomaly » de même niveau ;
- `*packages.json` → artefacts `installed_app` (servent à corroborer ALEAPP/Autopsy).

Testé avec MVT 2026.9.28 (sortie réelle, voir tests/fixtures/mvt_2026.9.28).
"""
from __future__ import annotations

import json
import shutil
import zipfile
from collections import OrderedDict
from pathlib import Path
from typing import Any

from veritrace.core.logging_setup import get_logger
from veritrace.core.timeutil import utc_now_iso
from veritrace.core.tools import detect
from veritrace.parsing.base import (ArtifactBuilder, RunContext, ToolFailed, ToolUnavailable, ToolWrapper,
                                    WrapperResult, run_tool)
from veritrace.parsing.util import clean, to_iso

log = get_logger("parsing.mvt")

MODES = ("androidqf", "backup", "bugreport")

#: type de collection MVT → type d'indicateur du schéma
IOC_TYPES = {
    "app_ids": "package", "domains": "domain", "urls": "url", "processes": "process",
    "files_sha256": "file_hash", "files_sha1": "file_hash", "files_md5": "file_hash",
    "app_cert_hashes": "certificate", "file_names": "file_path", "file_paths": "file_path",
}
IOC_TYPE_FR = {"package": "application", "domain": "domaine", "url": "URL", "process": "processus",
               "file_hash": "empreinte de fichier", "certificate": "certificat d'application",
               "file_path": "fichier", "other": "indicateur"}
#: indicateurs désignant sans ambiguïté un composant installé → confiance élevée
STRONG_IOC = {"package", "file_hash", "certificate", "process"}
LEVELS = {"CRITICAL": "critical", "HIGH": "high", "MEDIUM": "medium", "LOW": "low", "INFO": "info"}


class IocFileError(ValueError):
    pass


def check_stix2(path: Path) -> int:
    """Vérifie qu'un fichier est un bundle STIX2 avec des indicateurs ; renvoie leur nombre."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise IocFileError(f"{path} : JSON illisible ({exc})") from exc
    objects = data.get("objects") if isinstance(data, dict) else None
    if data.get("type") != "bundle" or not isinstance(objects, list):
        raise IocFileError(f"{path} : ce n'est pas un bundle STIX2")
    n = sum(1 for o in objects if isinstance(o, dict) and o.get("type") == "indicator" and o.get("pattern"))
    if not n:
        raise IocFileError(f"{path} : aucun indicateur STIX2 (type 'indicator' avec 'pattern')")
    return n


def detect_mode(path: Path) -> str | None:
    """androidqf : packages.json ; backup : .ab ou dossier apps/ ; bugreport : dumpstate/bugreport.

    Renvoie None si le format n'est pas reconnu (pas de supposition).
    """
    def _bugreport(names: list[str]) -> bool:
        return any(Path(n).name.startswith(("bugreport", "dumpstate")) for n in names)

    if path.is_dir():
        if any(path.rglob("packages.json")):
            return "androidqf"
        if (path / "apps").is_dir() or any(path.glob("*.ab")):
            return "backup"
        if _bugreport([p.name for p in path.iterdir()]):
            return "bugreport"
        return None
    if path.suffix.lower() == ".ab":
        return "backup"
    if path.suffix.lower() == ".zip":
        try:
            names = zipfile.ZipFile(path).namelist()
        except zipfile.BadZipFile:
            return None
        if any(n.endswith("packages.json") for n in names):
            return "androidqf"
        if _bugreport(names):
            return "bugreport"
    return None


def _load_json(p: Path) -> Any:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        log.warning("MVT : %s illisible (%s)", p.name, exc)
        return None


def load_alerts(out: Path) -> list[dict]:
    if (out / "alerts.json").is_file():
        data = _load_json(out / "alerts.json")
        return data if isinstance(data, list) else []
    alerts = []
    for f in sorted(out.glob("*_detected.json")):  # anciennes versions : enregistrements bruts
        data = _load_json(f)
        for rec in data if isinstance(data, list) else []:
            if isinstance(rec, dict):
                alerts.append({"level": "HIGH", "module": f.stem.replace("_detected", ""), "message": "",
                               "event_time": rec.get("isodate") or rec.get("timestamp") or "",
                               "event": rec, "matched_indicator": rec.get("matched_indicator")})
    return alerts


def _event_subject(ev: dict) -> str | None:
    for k in ("name", "package_name", "package", "url", "domain", "process_name", "proc_name", "file_path", "path"):
        if isinstance(ev, dict) and ev.get(k):
            return str(ev[k])
    return None


def mvt_version(out: Path) -> str | None:
    info = _load_json(out / "info.json") if (out / "info.json").is_file() else None
    return (info or {}).get("mvt_version") if isinstance(info, dict) else None


def normalize(out: Path, builder: ArtifactBuilder, tool: dict[str, Any]) -> tuple[list[dict], list[str]]:
    """Renvoie (constats à identifiants locaux, remarques)."""
    notes: list[str] = []
    # Applications installées (pour corroboration)
    pkg_ids: dict[str, str] = {}
    for f in sorted(out.glob("*packages.json")):
        data = _load_json(f)
        for i, rec in enumerate(data if isinstance(data, list) else [], start=1):
            pkg = clean(rec.get("name") or rec.get("package_name")) if isinstance(rec, dict) else None
            if not pkg:
                continue
            installer = clean(rec.get("installer"))
            first = to_iso(rec.get("first_install_time") or rec.get("timestamp"))
            pkg_ids[pkg.lower()] = builder.add(
                category="installed_app", timestamp=first, tool=tool,
                data={"package": pkg, "installer": None if installer in (None, "null") else installer,
                      "first_install": first, "is_system": rec.get("system")},
                file_path=f.name, record_ref=f"MVT {f.name} entrée {i}")

    findings: "OrderedDict[tuple, dict]" = OrderedDict()
    skipped_low = 0
    for i, alert in enumerate(load_alerts(out), start=1):
        level = LEVELS.get(str(alert.get("level") or "").upper(), "info")
        ind = alert.get("matched_indicator") or None
        ev = alert.get("event") if isinstance(alert.get("event"), dict) else {}
        subject = _event_subject(ev)
        ts = to_iso(alert.get("event_time"))
        module = alert.get("module") or "?"
        ref = f"MVT alerts.json entrée {i} (module {module})"
        if ind:
            itype = IOC_TYPES.get(ind.get("type"), "other")
            value = str(ind.get("value") or "")
            family = ind.get("name") or None
            src = ind.get("stix2_file_name") or "IOC"
            aid = builder.add(category="ioc_match", timestamp=ts, tool=tool, tags=["ioc"],
                              data={"indicator_type": itype, "indicator": value, "matched_value": subject or value,
                                    "ioc_source": src, "malware_family": family},
                              file_path=f"{module}", record_ref=ref)
            key = ("ioc", itype, value.lower())
            sev = "critical" if level == "critical" else "high"
            f = findings.get(key)
            if f is None:
                findings[key] = f = {
                    "type": "ioc_match", "severity": sev, "artifact_ids": [], "evidence_ids": [],
                    "corroborated": False, "confidence": "high" if itype in STRONG_IOC else "medium",
                    "title": f"Détection d'IOC — {IOC_TYPE_FR[itype]} « {value} »" + (f" ({family})" if family else ""),
                    "description": (f"MVT {tool.get('version') or ''} (module {module}) signale une correspondance entre "
                                    f"l'élément « {subject or value} » de l'extraction et l'indicateur de type "
                                    f"{IOC_TYPE_FR[itype]} « {value} » du jeu d'IOC « {src} »"
                                    + (f", associé à la famille « {family} »" if family else "") + "."),
                    "interpretation": ("Correspondance automatique avec un indicateur de compromission publié. "
                                       "Elle signale très probablement la présence du logiciel concerné, mais doit "
                                       "être confirmée par l'examinateur (contexte d'installation, activité)."),
                    "plain_summary": (f"Un élément correspondant à un logiciel malveillant connu"
                                      + (f" ({family})" if family else "") + " a été détecté sur l'appareil."),
                    "business_impact": "Compromission possible de la confidentialité des communications et de la localisation.",
                    "remediation": [
                        {"action": "Isoler l'appareil (mode avion) et le conserver en l'état jusqu'à la fin des constatations.",
                         "priority": "immediate", "owner": "Responsable sécurité"},
                        {"action": "Après constatations : supprimer l'élément détecté ou réinitialiser l'appareil, puis "
                                   "changer les mots de passe des comptes depuis un appareil sain.",
                         "priority": "short_term", "owner": "Support informatique"}],
                }
            if sev == "critical":
                f["severity"] = "critical"
            if aid not in f["artifact_ids"]:
                f["artifact_ids"].append(aid)
            if itype == "package" and value.lower() in pkg_ids and pkg_ids[value.lower()] not in f["artifact_ids"]:
                f["artifact_ids"].append(pkg_ids[value.lower()])
            continue

        if level not in ("critical", "high", "medium"):
            skipped_low += 1
            continue
        msg = clean(alert.get("message")) or "alerte MVT"
        ids = []
        if subject and subject.lower() in pkg_ids:
            ids.append(pkg_ids[subject.lower()])
        else:
            ids.append(builder.add(category="other", timestamp=ts, tool=tool,
                                   data={"mvt_module": module, "level": level, "message": msg, "subject": subject},
                                   file_path=module, record_ref=ref))
        key = ("heur", module, msg)
        if key not in findings:
            findings[key] = {
                "type": "suspicious_app" if "package" in module else "anomaly", "severity": level,
                "title": (f"Alerte heuristique MVT ({module})" + (f" — {subject}" if subject else ""))[:200],
                "artifact_ids": ids, "evidence_ids": [], "corroborated": False,
                "confidence": "medium",
                "description": f"MVT {tool.get('version') or ''} (module {module}) émet une alerte de niveau "
                               f"{alert.get('level')} : « {msg} ».",
                "interpretation": "Alerte heuristique (sans correspondance d'IOC) : elle signale une configuration "
                                  "inhabituelle qui doit être expliquée, sans constituer une preuve de compromission.",
                "plain_summary": msg,
                "remediation": [{"action": "Vérifier la légitimité de l'élément signalé auprès de l'utilisateur.",
                                 "priority": "short_term", "owner": "Responsable sécurité"}],
            }
    if skipped_low:
        notes.append(f"{skipped_low} alerte(s) MVT de niveau LOW/INFO non retenue(s) comme constat.")
    return list(findings.values()), notes


class MvtWrapper(ToolWrapper):
    key = "mvt"
    name = "mvt"

    def run(self, extraction: Path, out_dir: Path, ctx: RunContext) -> WrapperResult:
        started = utc_now_iso()
        imported = ctx.options.get("from_output")
        iocs: list[Path] = []
        notes: list[str] = []
        for raw in ctx.options.get("iocs") or []:
            p = Path(raw)
            n = check_stix2(p)  # lève IocFileError : fichier invalide = erreur explicite
            dest = ctx.options["ioc_store"] / p.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            if p.resolve() != dest.resolve():
                shutil.copy2(p, dest)
            iocs.append(dest)
            notes.append(f"IOC : {p.name} ({n} indicateur(s)).")
        if not iocs and not imported:
            notes.append("Aucun fichier d'IOC fourni : seules les heuristiques intégrées de MVT ont été appliquées.")

        command: list[str] = []
        if imported:
            out = Path(imported)
            mode = "imported"
        else:
            status = detect("mvt")
            if not status.available:
                raise ToolUnavailable(status.message)
            mvt_mode = ctx.options.get("mode") or detect_mode(extraction)
            if mvt_mode not in MODES:
                raise ToolFailed(
                    f"format d'entrée non reconnu par MVT ({extraction.name}) : fournir un bundle AndroidQF, une "
                    "sauvegarde .ab ou un bugreport (--mvt-input / --mode)")
            out = out_dir / "raw"
            out.mkdir(parents=True, exist_ok=True)
            command = [status.path, "--disable-update-check", "--disable-indicator-update-check", f"check-{mvt_mode}"]
            if mvt_mode != "bugreport":
                command.append("-n")
            command += ["-o", str(out.resolve())]
            for i in iocs:
                command += ["-i", str(i.resolve())]
            command.append(str(extraction.resolve()))
            run_tool(command, out_dir / "mvt.log", timeout=int(ctx.options.get("timeout") or 3600))
            notes.insert(0, f"Mode MVT : check-{mvt_mode}.")
            mode = "executed"

        version = mvt_version(out)
        if not version and not imported:
            version = (detect("mvt").version or None)
        tool = {"name": "MVT", "version": version}
        builder = ArtifactBuilder(ctx.run_id, ctx.evidence_id)
        findings, more = normalize(out, builder, tool)
        notes += more
        n_ioc = sum(1 for f in findings if f["type"] == "ioc_match")
        notes.append(f"{n_ioc} détection(s) IOC, {len(findings) - n_ioc} alerte(s) heuristique(s) retenue(s).")
        return WrapperResult(tool=tool, mode=mode, command=command, started_at=started, ended_at=utc_now_iso(),
                             output_path=out, artifacts=builder.items, findings=findings, notes=notes,
                             extra_evidence=iocs)
