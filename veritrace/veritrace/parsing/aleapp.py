"""Wrapper ALEAPP (Android Logs Events And Protobuf Parser).

Exécution : `aleapp.py -t {fs|tar|zip|gz} -i <extraction> -o <sortie>` (parsing complet).
Import : `--from-output` sur un dossier `ALEAPP_Output_*` / `ALEAPP_Reports_*` existant.

Normalisation, par ordre de préférence :
1. **LAVA** (ALEAPP ≥ 2025) : `_lava_data.lava` (JSON : liste des artefacts, chemins
   sources, colonnes horodatées) + `_lava_artifacts.db` (une table SQLite par artefact,
   horodatages en epoch secondes UTC).
2. **TSV** (`_TSV Exports/*.tsv`) pour les versions plus anciennes.

Les colonnes sont lues par leur NOM AFFICHÉ (identique en LAVA via `column_map` et en
TSV), ce qui permet une seule table de correspondance. Les artefacts ALEAPP non couverts
par cette table sont listés dans la remarque de l'exécution (rien n'est perdu : la sortie
brute reste dans parsed/aleapp/<RUN-ID>/).

Testé avec ALEAPP 2026.4.2 (sortie réelle, voir tests/fixtures/aleapp_2026.4.2).
"""
from __future__ import annotations

import csv
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any, Callable, Iterator

from veritrace.core.logging_setup import get_logger
from veritrace.core.timeutil import utc_now_iso
from veritrace.core.tools import detect
from veritrace.parsing.base import (ArtifactBuilder, RunContext, ToolFailed, ToolUnavailable, ToolWrapper,
                                    WrapperResult, run_tool)
from veritrace.parsing.util import clean, to_float, to_int, to_iso

log = get_logger("parsing.aleapp")

Row = dict[str, Any]
Emit = Callable[..., str]

csv.field_size_limit(sys.maxsize)


# --------------------------------------------------------------------------- correspondances
def _direction_sms(v: Any) -> str:
    v = (clean(v) or "").lower()
    if v in ("received", "inbox", "incoming"):
        return "incoming"
    if v in ("sent", "outbox", "outgoing", "queued", "failed"):
        return "outgoing"
    return "unknown"


def _direction_call(v: Any) -> str:
    v = (clean(v) or "").lower()
    return {"incoming": "incoming", "outgoing": "outgoing", "missed": "missed", "rejected": "rejected",
            "blocked": "blocked", "answered externally": "incoming", "voicemail": "incoming"}.get(v, "unknown")


def _first(row: Row, *names: str) -> Any:
    for n in names:
        if n in row and row[n] not in (None, "", " "):
            return row[n]
    return None


def map_sms(row: Row, emit: Emit) -> None:
    ts = to_iso(_first(row, "Date", "Date Received"))
    address = clean(_first(row, "Address", "From", "Partner"))
    if not address and not row.get("Body"):
        return
    mtype = (clean(row.get("Message Type")) or "SMS").lower()
    emit("sms", ts, {
        "direction": _direction_sms(_first(row, "Direction", "Type")),
        "address": address or "",
        "body": clean(row.get("Body")),
        "service": mtype if mtype in ("sms", "mms", "rcs") else "unknown",
        "read": {"1": True, "0": False}.get(str(row.get("Read") or "").strip()),
        "thread_id": clean(row.get("Thread ID")),
    }, f"msg_id={clean(row.get('MSG ID'))}")


def map_call(row: Row, emit: Emit) -> None:
    number = clean(_first(row, "Partner", "Phone Number", "Number"))
    if not number:
        return
    emit("call", to_iso(_first(row, "Call Date", "Date")), {
        "direction": _direction_call(row.get("Type")),
        "number": number,
        "duration_s": to_int(_first(row, "Duration in Secs", "Duration")),
    })


def map_web(row: Row, emit: Emit) -> None:
    url = clean(_first(row, "URL", "Url"))
    if not url:
        return
    emit("browser_history", to_iso(_first(row, "Last Visit Time", "Visit Time", "Timestamp")), {
        "url": url, "title": clean(row.get("Title")), "browser": clean(row.get("Browser Name")),
        "visit_count": to_int(row.get("Visit Count")),
    })


def map_location(provider: str) -> Callable[[Row, Emit], None]:
    def _map(row: Row, emit: Emit) -> None:
        lat = to_float(_first(row, "latitude", "Latitude"))
        lon = to_float(_first(row, "longitude", "Longitude"))
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return
        emit("location", to_iso(_first(row, "timestamp", "Timestamp", "Readtime")), {
            "latitude": lat, "longitude": lon, "accuracy_m": to_float(_first(row, "accuracy", "Accuracy")),
            "provider": provider,
        })
    return _map


def map_package_info(row: Row, emit: Emit) -> None:
    pkg = clean(_first(row, "Name", "Package Name", "Package"))
    if not pkg:
        return
    first = to_iso(_first(row, "Install Time", "ft"))
    emit("installed_app", first, {
        "package": pkg, "installer": clean(row.get("Installer")), "first_install": first,
    })


def map_usage(row: Row, emit: Emit) -> None:
    if (row.get("Usage Type") or "") != "event-log":
        return  # les lignes « packages » sont des cumuls, pas des événements datés
    pkg = clean(row.get("Package"))
    if not pkg:
        return
    etype = (row.get("Event Type") or "").upper()
    event = ("foreground" if etype in ("ACTIVITY_RESUMED", "MOVE_TO_FOREGROUND") else
             "background" if etype in ("ACTIVITY_PAUSED", "ACTIVITY_STOPPED", "MOVE_TO_BACKGROUND") else
             "screen_on" if etype == "SCREEN_INTERACTIVE" else
             "screen_off" if etype == "SCREEN_NON_INTERACTIVE" else
             "notification" if etype == "NOTIFICATION_INTERRUPTION" else "other")
    emit("app_usage", to_iso(row.get("Timestamp / Last Time Active")), {"package": pkg, "event": event},
         f"event={etype or '?'}")


def map_account(row: Row, emit: Emit) -> None:
    t, n = clean(row.get("Account Type")), clean(row.get("Account Name"))
    if t and n:
        emit("account", None, {"account_type": t, "account_name": n})


def map_wifi(row: Row, emit: Emit) -> None:
    ssid = clean(row.get("SSID"))
    if not ssid:
        return
    ssid = ssid.strip('"')
    bssid = clean(_first(row, "BSSID", "DefaultGwMacAddress"))
    last = to_iso(row.get("LastConnectedTime"))
    emit("wifi", last, {"ssid": ssid, "bssid": bssid.lower() if bssid else None,
                        "security": clean(row.get("SecurityMode")), "last_connected": last})


def map_bluetooth(row: Row, emit: Emit) -> None:
    mac = clean(row.get("MAC Address"))
    if not mac or len(mac) != 17:
        return
    emit("bluetooth", to_iso(row.get("First Connected Timestamp")), {
        "mac": mac.upper(), "name": clean(row.get("Device Name")), "paired": bool(clean(row.get("Link Key"))),
    })


def map_contact(rows: list[Row], emit: Emit, ref: str) -> None:
    """Contacts : une ligne par donnée (téléphone, e-mail…) → regroupement par nom."""
    people: dict[str, dict[str, set]] = {}
    for r in rows:
        name = clean(r.get("Display Name"))
        if not name:
            continue
        p = people.setdefault(name, {"phones": set(), "emails": set()})
        if clean(r.get("Phone Number")):
            p["phones"].add(clean(r.get("Phone Number")))
        if clean(r.get("Email Address")):
            p["emails"].add(clean(r.get("Email Address")))
    for name, p in people.items():
        emit("contact", None, {"display_name": name, "phone_numbers": sorted(p["phones"]),
                               "emails": sorted(p["emails"])}, ref)


#: nom d'artefact ALEAPP (tel qu'affiché / nom du TSV) → fonction de normalisation
ROW_MAPPERS: dict[str, Callable[[Row, Emit], None]] = {
    "SMS Messages": map_sms,
    "SMS and MMS Messages": map_sms,
    "Call logs": map_call,
    "Web History": map_web,
    "Browser Location": map_location("browser"),
    "Cache Location": map_location("cache"),
    "package_info": map_package_info,
    "Usage Stats": map_usage,
    "Accounts_ce": map_account,
    "Accounts_de": map_account,
    "wifiProfiles": map_wifi,
    "WiFi Config Store": map_wifi,
    "Bluetooth Connections": map_bluetooth,
}
GROUP_MAPPERS = {"Contacts": map_contact}


# --------------------------------------------------------------------------- lecture des sorties
def find_report_dir(path: Path) -> Path:
    """Localise le dossier de rapport ALEAPP (le plus récent) sous `path` ou `path` lui-même."""
    markers = ("_lava_data.lava", "_TSV Exports")
    if any((path / m).exists() for m in markers):
        return path
    cands = [p for p in path.glob("ALEAPP_*") if p.is_dir() and any((p / m).exists() for m in markers)]
    if not cands:
        raise ToolFailed(f"aucun rapport ALEAPP (_lava_data.lava ou _TSV Exports) dans {path}")
    return max(cands, key=lambda p: p.stat().st_mtime)


def iter_lava(report: Path) -> Iterator[tuple[str, str | None, list[Row]]]:
    """(nom d'artefact, chemin source, lignes clé=nom affiché) depuis la sortie LAVA."""
    meta = json.loads((report / "_lava_data.lava").read_text(encoding="utf-8"))
    db = report / meta.get("lava_db_name", "_lava_artifacts.db")
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        for entries in (meta.get("artifacts") or {}).values():
            for a in entries:
                cmap = a.get("column_map") or {}
                try:
                    rows = con.execute(f'SELECT * FROM "{a["tablename"]}"').fetchall()
                except sqlite3.Error as exc:
                    log.warning("ALEAPP/LAVA : table %s illisible (%s)", a.get("tablename"), exc)
                    continue
                yield (a["name"].strip(), a.get("source_path"),
                       [{cmap.get(k, k): r[k] for k in r.keys()} for r in rows])
    finally:
        con.close()


def iter_tsv(report: Path) -> Iterator[tuple[str, str | None, list[Row]]]:
    for tsv in sorted((report / "_TSV Exports").glob("*.tsv")):
        with open(tsv, encoding="utf-8-sig", newline="") as fh:
            rows = list(csv.DictReader(fh, delimiter="\t"))
        yield tsv.stem.strip(), None, rows


def lava_version(report: Path) -> str | None:
    try:
        meta = json.loads((report / "_lava_data.lava").read_text(encoding="utf-8"))
        return (meta.get("parser_info") or {}).get("leapp_version")
    except (OSError, ValueError):
        return None


def normalize(report: Path, builder: ArtifactBuilder, tool: dict[str, Any]) -> list[str]:
    """Normalise un rapport ALEAPP ; renvoie des remarques (artefacts non couverts…)."""
    use_lava = (report / "_lava_data.lava").is_file()
    source = iter_lava(report) if use_lava else iter_tsv(report)
    unmapped: list[str] = []
    for name, src_path, rows in source:
        if not rows:
            continue
        line = {"n": 0}

        def emit(category: str, ts: str | None, data: dict, ref: str | None = None) -> str:
            return builder.add(category=category, timestamp=ts, tool=tool, data=data, file_path=src_path,
                               record_ref=f"ALEAPP « {name} » ligne {line['n']}" + (f" ({ref})" if ref else ""))

        if name in GROUP_MAPPERS:
            GROUP_MAPPERS[name](rows, emit, None)
            continue
        mapper = ROW_MAPPERS.get(name)
        if mapper is None:
            unmapped.append(f"{name} ({len(rows)})")
            continue
        for i, row in enumerate(rows, start=1):
            line["n"] = i
            try:
                mapper(row, emit)
            except Exception as exc:  # une ligne malformée ne doit pas arrêter l'analyse
                log.warning("ALEAPP « %s » ligne %d ignorée : %s", name, i, exc)
    notes = [f"Format lu : {'LAVA' if use_lava else 'TSV'}."]
    if unmapped:
        notes.append("Artefacts ALEAPP conservés en sortie brute, non normalisés : " + ", ".join(sorted(unmapped)) + ".")
    return notes


# --------------------------------------------------------------------------- wrapper
def input_type(path: Path) -> str:
    if path.is_dir():
        return "fs"
    name = path.name.lower()
    if name.endswith((".tar.gz", ".tgz", ".gz")):
        return "gz"
    if name.endswith(".tar"):
        return "tar"
    if name.endswith(".zip"):
        return "zip"
    return "raw"


def aleapp_command(exe: str) -> tuple[list[str], Path | None]:
    """Commande de base + répertoire de travail (aleapp.py doit être lancé depuis son dossier)."""
    if exe.endswith(".py"):
        python = os.environ.get("VERITRACE_ALEAPP_PYTHON") or sys.executable
        return [python, exe], Path(exe).parent
    return [exe], None


class AleappWrapper(ToolWrapper):
    key = "aleapp"
    name = "aleapp"

    def run(self, extraction: Path, out_dir: Path, ctx: RunContext) -> WrapperResult:
        started = utc_now_iso()
        imported = ctx.options.get("from_output")
        command: list[str] = []
        if imported:
            report = find_report_dir(Path(imported))
            mode = "imported"
            version = lava_version(report)
        else:
            status = detect("aleapp")
            if not status.available:
                raise ToolUnavailable(status.message)
            base, cwd = aleapp_command(status.path)
            raw = out_dir / "raw"
            raw.mkdir(parents=True, exist_ok=True)
            command = base + ["-t", ctx.options.get("input_type") or input_type(extraction),
                              "-i", str(extraction.resolve()), "-o", str(raw.resolve())]
            run_tool(command, out_dir / "aleapp.log", timeout=int(ctx.options.get("timeout") or 4 * 3600), cwd=cwd)
            report = find_report_dir(raw)
            mode = "executed"
            version = lava_version(report) or (status.version or "").replace("ALEAPP", "").strip() or None

        tool = {"name": "ALEAPP", "version": version}
        builder = ArtifactBuilder(ctx.run_id, ctx.evidence_id)
        notes = normalize(report, builder, tool)
        if builder.internal_duplicates:
            notes.append(f"{builder.internal_duplicates} doublon(s) interne(s) fusionné(s) "
                         "(même fait dans plusieurs artefacts ALEAPP).")
        return WrapperResult(tool=tool, mode=mode, command=command, started_at=started, ended_at=utc_now_iso(),
                             output_path=report, artifacts=builder.items, notes=notes)
