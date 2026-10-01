"""Client ADB minimal et sûr.

Principes :
- Seules des commandes ADB **standard**, utilisables sur un appareil dont l'utilisateur a
  activé le débogage USB et autorisé ce poste, sont employées : `devices`, `shell getprop`,
  `shell pm`, `shell dumpsys`, `pull`, `backup`, `bugreport`.
- **Aucun contournement** : pas de `su`, pas d'exploit, pas d'injection de touches
  (`input keyevent`) ni de saisie de code. Un appareil « unauthorized », « offline » ou
  verrouillé n'est pas « forcé » : Veritrace s'arrête et explique ce que le titulaire doit
  faire lui-même.
- Chaque commande et sa sortie d'erreur sont tracées dans un journal (`adb.log`).
"""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from veritrace.core.logging_setup import get_logger
from veritrace.core.timeutil import utc_now_iso

log = get_logger("acquisition.adb")

#: Mots de commande interdits (comparaison exacte, mot par mot), vérifiés avant chaque appel :
#: garde-fou contre toute évolution du code vers l'élévation de privilèges ou le contournement.
FORBIDDEN = {"su", "input", "keyevent", "locksettings", "setprop", "reboot", "root", "unroot", "remount",
             "disable-verity", "sideload", "install", "uninstall"}

STATE_HELP = {
    "unauthorized": "Le débogage USB n'est pas autorisé pour ce poste. Le titulaire doit déverrouiller l'appareil "
                    "lui-même et accepter la demande « Autoriser le débogage USB ? ».",
    "offline": "L'appareil ne répond pas (offline). Débrancher/rebrancher le câble ; vérifier le mode USB.",
    "no permissions": "Le système du poste refuse l'accès USB (règles udev manquantes sous Linux).",
    "recovery": "L'appareil est en mode recovery : acquisition logique impossible dans ce mode.",
    "sideload": "L'appareil est en mode sideload : acquisition logique impossible dans ce mode.",
    "bootloader": "L'appareil est en mode bootloader : acquisition logique impossible dans ce mode.",
}


class AdbError(RuntimeError):
    pass


class DeviceNotReady(AdbError):
    pass


@dataclass
class DeviceInfo:
    serial: str
    state: str
    attrs: dict[str, str] = field(default_factory=dict)

    @property
    def ready(self) -> bool:
        return self.state == "device"

    @property
    def help(self) -> str:
        return STATE_HELP.get(self.state, f"État « {self.state} » : acquisition impossible.")


def parse_devices(text: str) -> list[DeviceInfo]:
    """Analyse la sortie de `adb devices -l`."""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("List of devices", "*")):
            continue
        m = re.match(r"^(\S+)\s+(no permissions|\S+)\s*(.*)$", line)
        if not m:
            continue
        attrs = dict(kv.split(":", 1) for kv in m.group(3).split() if ":" in kv)
        out.append(DeviceInfo(m.group(1), m.group(2), attrs))
    return out


def parse_getprop(text: str) -> dict[str, str]:
    return {m.group(1): m.group(2) for m in re.finditer(r"^\[(.+?)\]: \[(.*)\]\s*$", text, re.M)}


class Adb:
    def __init__(self, exe: str, *, serial: str | None = None, log_path: Path | None = None) -> None:
        self.exe = exe
        self.serial = serial
        self.log_path = log_path

    def _log(self, text: str) -> None:
        if self.log_path:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.log_path, "a", encoding="utf-8", errors="replace") as fh:
                fh.write(text if text.endswith("\n") else text + "\n")

    def run(self, *args: str, timeout: int = 120, stdout_file: Path | None = None,
            check: bool = True) -> subprocess.CompletedProcess:
        joined = " ".join(args)
        if FORBIDDEN.intersection(a.strip() for a in args):
            raise AdbError(f"commande refusée par le garde-fou de Veritrace : adb {joined}")
        cmd = [self.exe] + (["-s", self.serial] if self.serial else []) + list(args)
        self._log(f"# {utc_now_iso()} $ {' '.join(cmd)}")
        try:
            if stdout_file:
                stdout_file.parent.mkdir(parents=True, exist_ok=True)
                with open(stdout_file, "wb") as fh:
                    proc = subprocess.run(cmd, stdout=fh, stderr=subprocess.PIPE, timeout=timeout)
                proc.stdout = b""
            else:
                proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            self._log(f"  ! délai dépassé ({timeout} s)")
            raise AdbError(f"adb {joined} : délai dépassé ({timeout} s)") from exc
        except OSError as exc:
            raise AdbError(f"adb introuvable ou non exécutable : {exc}") from exc
        err = (proc.stderr or b"").decode("utf-8", "replace").strip()
        self._log(f"  → code {proc.returncode}" + (f" ; stderr : {err[:2000]}" if err else ""))
        if check and proc.returncode != 0:
            raise AdbError(f"adb {joined} : code {proc.returncode} {err[:300]}")
        return proc

    def text(self, *args: str, timeout: int = 120) -> str:
        return self.run(*args, timeout=timeout).stdout.decode("utf-8", "replace")

    # -- appareil ---------------------------------------------------------------
    def devices(self) -> list[DeviceInfo]:
        saved, self.serial = self.serial, None
        try:
            return parse_devices(self.text("devices", "-l", timeout=30))
        finally:
            self.serial = saved

    def select(self, serial: str | None) -> DeviceInfo:
        """Choisit l'appareil ; lève DeviceNotReady avec l'explication adaptée."""
        devs = self.devices()
        if serial:
            devs = [d for d in devs if d.serial == serial]
            if not devs:
                raise DeviceNotReady(f"Appareil {serial} non détecté.")
        if not devs:
            raise DeviceNotReady("Aucun appareil détecté. Vérifier le câble, le mode de transfert USB et que le "
                                 "débogage USB a été activé par le titulaire.")
        if len(devs) > 1:
            raise DeviceNotReady("Plusieurs appareils détectés : préciser --serial "
                                 f"({', '.join(d.serial for d in devs)}).")
        d = devs[0]
        if not d.ready:
            raise DeviceNotReady(f"Appareil {d.serial} : {d.help}")
        self.serial = d.serial
        return d

    def getprop(self) -> tuple[dict[str, str], str]:
        raw = self.text("shell", "getprop")
        return parse_getprop(raw), raw

    def exists(self, remote: str) -> bool:
        return self.run("shell", "ls", "-d", remote, check=False, timeout=30).returncode == 0
