"""Session d'acquisition logique ADB.

Chaque méthode produit UNE acquisition (`ACQ-nn`) dans le JSON de l'affaire :

| Méthode     | Commande ADB                                   | Élément(s) collecté(s)            |
|-------------|------------------------------------------------|-----------------------------------|
| getprop     | `shell getprop` (toujours exécutée en premier) | getprop.txt + fiche appareil      |
| packages    | `shell pm list packages -f -i -U`              | packages.txt                      |
| dumpsys     | `shell dumpsys <service>`                      | dumpsys_<service>.txt             |
| backup      | `backup -all [-shared] -f backup.ab`           | backup.ab (+ backup.tar dérivé)   |
| pull        | `pull -a <chemin>` (stockage partagé)          | un dossier par chemin (manifeste) |
| bugreport   | `bugreport <dossier>`                          | bugreport-*.zip                   |

Pour chaque élément : hachage SHA-256 dès l'écriture, passage en lecture seule,
événement de custody « collected » (qui, quoi, quand, où, empreinte). Le journal des
commandes ADB de l'acquisition est lui-même collecté comme élément de preuve.
L'affaire est sauvegardée après chaque méthode : une interruption ne perd rien.
"""
from __future__ import annotations

import re
import socket
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from veritrace.acquisition.adb import Adb, AdbError, DeviceInfo
from veritrace.acquisition.backup import BackupEncrypted, BackupError, ab_to_tar, read_header
from veritrace.core.case import Case
from veritrace.core.evidence import next_id, register_collected
from veritrace.core.logging_setup import get_logger
from veritrace.core.timeutil import utc_now_iso

log = get_logger("acquisition")

METHODS = ("getprop", "packages", "dumpsys", "backup", "pull", "bugreport")
DEFAULT_METHODS = ("getprop", "packages", "dumpsys", "backup")
SCHEMA_METHOD = {"getprop": "adb_getprop", "packages": "adb_package_list", "dumpsys": "adb_dumpsys",
                 "backup": "adb_backup", "pull": "adb_pull", "bugreport": "adb_bugreport"}
DUMPSYS_SERVICES = ("package", "usagestats", "account", "wifi", "bluetooth_manager", "location", "appops")
DEFAULT_PULL = ("/sdcard/DCIM", "/sdcard/Pictures", "/sdcard/Download", "/sdcard/Documents")


@dataclass
class DeviceMeta:
    imei: list[str] = field(default_factory=list)
    owner: str | None = None
    seal_number: str | None = None
    state_on_receipt: str | None = None


@dataclass
class StepResult:
    acquisition_id: str
    method: str
    status: str
    evidence_ids: list[str]
    notes: list[str]


def device_profile(props: dict[str, str], dev: DeviceInfo, meta: DeviceMeta) -> dict[str, Any]:
    model = props.get("ro.product.model") or dev.attrs.get("model", "").replace("_", " ") or "inconnu"
    return {
        "manufacturer": props.get("ro.product.manufacturer") or props.get("ro.product.brand") or "inconnu",
        "model": model,
        "android_version": props.get("ro.build.version.release") or None,
        "security_patch": props.get("ro.build.version.security_patch") or None,
        "build_fingerprint": props.get("ro.build.fingerprint") or None,
        "serial": props.get("ro.serialno") or dev.serial,
        "imei": meta.imei,
        "owner": meta.owner,
        "state_on_receipt": meta.state_on_receipt or "Allumé, déverrouillé par le titulaire, débogage USB autorisé par lui",
        "seal_number": meta.seal_number,
    }


def register_device(doc: dict, profile: dict[str, Any]) -> str:
    for d in doc["devices"]:
        if profile["serial"] and d.get("serial") == profile["serial"]:
            for k, v in profile.items():  # complète sans écraser ce que l'examinateur a saisi
                if v and not d.get(k):
                    d[k] = v
            return d["device_id"]
    device_id = next_id(doc["devices"], "device_id", "DEV-", 2)
    doc["devices"].append({"device_id": device_id, **{k: v for k, v in profile.items() if v not in (None, [])}})
    return device_id


def _safe_name(remote: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", remote.strip("/")) or "racine"


class AcquisitionSession:
    def __init__(self, case: Case, adb: Adb, *, adb_version: str | None,
                 notify: Callable[[str], None] = lambda m: None) -> None:
        self.case = case
        self.adb = adb
        self.tool = {"name": "adb", "version": adb_version}
        self.notify = notify
        self.actor = case.auth.examiner
        self.location = f"Poste d'acquisition {socket.gethostname()}"
        self.device_id: str | None = None
        self.props: dict[str, str] = {}

    # -- squelette commun --------------------------------------------------------
    def _step(self, method: str, body: Callable[[Path, Callable[..., str], dict], tuple[str, list[str]]]) -> StepResult:
        doc = self.case.load()
        acq_id = next_id(doc["acquisitions"], "acquisition_id", "ACQ-", 2)
        out = self.case.root / "acquisition" / "raw" / acq_id
        out.mkdir(parents=True, exist_ok=True)
        self.adb.log_path = out / "adb.log"
        started = utc_now_iso()
        record = {"acquisition_id": acq_id, "device_id": self.device_id, "method": SCHEMA_METHOD[method],
                  "started_at": started, "ended_at": None, "operator": self.actor, "tool": self.tool,
                  "status": "failed", "notes": ""}
        evidence: list[str] = []

        def register(path: Path, label: str, etype: str = "file", device_path: str | None = None,
                     notes: str = "") -> str:
            ev = register_collected(doc, self.case.root, path, acquisition_id=acq_id, label=label, etype=etype,
                                    actor=self.actor, device_path=device_path, location=self.location,
                                    notes=notes or f"Collecte ADB ({method}).")
            evidence.append(ev)
            return ev

        try:
            status, notes = body(out, register, doc)
        except (AdbError, BackupError, OSError) as exc:
            status, notes = "failed", [str(exc)]
            log.error("Acquisition %s (%s) : %s", acq_id, method, exc)
        if not self.device_id:
            # Échec avant identification de l'appareil : rien à rattacher dans l'affaire ;
            # l'échec est consigné dans le journal d'audit (avec le journal ADB).
            self.case.audit.append("acquisition_step", {"acquisition_id": None, "method": method, "status": "failed",
                                                        "notes": notes, "adb_log": str(out / "adb.log")})
            return StepResult("—", method, "failed", [], notes)
        record.update(device_id=self.device_id, status=status, ended_at=utc_now_iso(), notes=" ".join(notes))
        if (out / "adb.log").is_file():
            register(out / "adb.log", f"Journal des commandes ADB ({acq_id})", "document",
                     notes="Journal horodaté des commandes ADB exécutées et de leurs codes retour.")
        doc["acquisitions"].append(record)
        self.case.save(doc, reason=f"acquisition_{method}")
        self.case.audit.append("acquisition_step", {"acquisition_id": acq_id, "method": method, "status": status,
                                                    "evidence_ids": evidence, "notes": notes})
        return StepResult(acq_id, method, status, evidence, notes)

    # -- méthodes ----------------------------------------------------------------
    def identify(self, dev: DeviceInfo, meta: DeviceMeta) -> StepResult:
        """getprop → fiche appareil + getprop.txt. Toujours la première étape."""
        def body(out: Path, register, doc: dict) -> tuple[str, list[str]]:
            props, raw = self.adb.getprop()
            if not props:
                raise AdbError("getprop n'a renvoyé aucune propriété")
            self.props = props
            (out / "getprop.txt").write_text(raw, encoding="utf-8")
            self.device_id = register_device(doc, device_profile(props, dev, meta))
            register(out / "getprop.txt", "Propriétés système (getprop)", device_path="getprop")
            return "success", [f"Appareil {self.device_id} : {props.get('ro.product.manufacturer')} "
                               f"{props.get('ro.product.model')}, Android {props.get('ro.build.version.release')}."]
        return self._step("getprop", body)

    def packages(self) -> StepResult:
        def body(out: Path, register, doc: dict) -> tuple[str, list[str]]:
            self.adb.run("shell", "pm", "list", "packages", "-f", "-i", "-U", stdout_file=out / "packages.txt")
            n = sum(1 for l in (out / "packages.txt").read_text(errors="replace").splitlines() if l.startswith("package:"))
            register(out / "packages.txt", "Liste des applications (pm list packages)", device_path="pm list packages")
            return "success", [f"{n} application(s) listée(s)."]
        return self._step("packages", body)

    def dumpsys(self, services: tuple[str, ...] = DUMPSYS_SERVICES) -> StepResult:
        def body(out: Path, register, doc: dict) -> tuple[str, list[str]]:
            failed = []
            for svc in services:
                f = out / f"dumpsys_{svc}.txt"
                proc = self.adb.run("shell", "dumpsys", svc, stdout_file=f, check=False, timeout=600)
                if proc.returncode != 0 or f.stat().st_size == 0:
                    failed.append(svc)
                    f.unlink(missing_ok=True)
                    continue
                register(f, f"État du service « {svc} » (dumpsys)", device_path=f"dumpsys {svc}")
            ok = len(services) - len(failed)
            notes = [f"{ok}/{len(services)} service(s) collecté(s)."]
            if failed:
                notes.append(f"Indisponibles : {', '.join(failed)}.")
            return ("success" if not failed else "partial" if ok else "failed"), notes
        return self._step("dumpsys", body)

    def backup(self, *, shared: bool = False, timeout: int = 4 * 3600) -> StepResult:
        def body(out: Path, register, doc: dict) -> tuple[str, list[str]]:
            notes = []
            sdk = int(self.props.get("ro.build.version.sdk") or 0)
            if sdk >= 31:
                notes.append(f"Android SDK {sdk} : depuis Android 12, adb backup n'inclut que les applications "
                             "qui l'autorisent explicitement — couverture réduite.")
            self.notify("Sauvegarde ADB : le titulaire doit confirmer « Sauvegarder mes données » sur l'écran de "
                        "l'appareil, SANS saisir de mot de passe de chiffrement.")
            ab = out / "backup.ab"
            args = ["backup", "-all", "-noapk"] + (["-shared"] if shared else ["-noshared"]) + ["-f", str(ab)]
            self.adb.run(*args, timeout=timeout, check=False)
            if not ab.exists() or ab.stat().st_size == 0:
                return "failed", notes + ["Aucune donnée : la sauvegarde a été refusée ou n'a pas été confirmée "
                                          "sur l'appareil."]
            ev_ab = register(ab, "Sauvegarde ADB (backup.ab)", "backup", device_path="adb backup -all")
            try:
                header = read_header(ab)
                tar = out / "backup.tar"
                entries = ab_to_tar(ab, tar)
            except BackupEncrypted as exc:
                return "partial", notes + [f"{exc}. Fournir le mot de passe à MVT (check-backup -p) si le "
                                           "titulaire l'a communiqué."]
            if entries == 0:
                tar.unlink(missing_ok=True)
                return "partial", notes + ["Sauvegarde vide (aucune application sauvegardée)."]
            register(tar, f"Sauvegarde convertie en tar (dérivée de {ev_ab})", "archive",
                     notes=f"Copie dérivée de {ev_ab} : retrait de l'en-tête Android Backup v{header['version']}"
                           f"{' et décompression zlib' if header['compressed'] == '1' else ''}, contenu inchangé.")
            return "success", notes + [f"{entries} entrée(s) dans la sauvegarde."]
        return self._step("backup", body)

    def pull(self, paths: tuple[str, ...] = DEFAULT_PULL, timeout: int = 4 * 3600) -> StepResult:
        def body(out: Path, register, doc: dict) -> tuple[str, list[str]]:
            notes, ok, partial = [], 0, False
            for remote in paths:
                if not self.adb.exists(remote):
                    notes.append(f"{remote} : absent sur l'appareil.")
                    continue
                dest = out / "pull" / _safe_name(remote)
                dest.parent.mkdir(parents=True, exist_ok=True)
                proc = self.adb.run("pull", "-a", remote, str(dest), timeout=timeout, check=False)
                if not dest.exists():
                    notes.append(f"{remote} : copie impossible (code {proc.returncode}).")
                    continue
                if proc.returncode != 0:
                    partial = True
                    notes.append(f"{remote} : copie partielle (fichiers inaccessibles sans privilège, voir adb.log).")
                register(dest, f"Copie de {remote}", "archive" if dest.is_dir() else "file", device_path=remote)
                ok += 1
            status = "failed" if not ok else "partial" if partial or ok < len(paths) else "success"
            return status, [f"{ok}/{len(paths)} chemin(s) copié(s)."] + notes
        return self._step("pull", body)

    def bugreport(self, timeout: int = 1800) -> StepResult:
        def body(out: Path, register, doc: dict) -> tuple[str, list[str]]:
            self.notify("Rapport de bogue : génération par l'appareil (plusieurs minutes).")
            self.adb.run("bugreport", str(out), timeout=timeout)
            zips = sorted(out.glob("*.zip"))
            if not zips:
                return "failed", ["Aucune archive bugreport produite."]
            for z in zips:
                register(z, f"Rapport de bogue Android ({z.name})", "archive", device_path="adb bugreport")
            return "success", [f"{len(zips)} archive(s) bugreport."]
        return self._step("bugreport", body)
