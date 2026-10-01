"""Récupération des enregistrements supprimés des bases SQLite (moteur `veritrace-recover`).

Pour chaque base prise en charge (SMS, journal d'appels, navigateurs, WhatsApp, Viber,
Messenger) :

1. copie BRUTE de la base et de ses fichiers `-wal` / `-journal` (lecture seule) : les
   octets sont lus sans passer par SQLite (`recovery/sqlite_format.py`), ce qui préserve les
   trames WAL et pages que SQLite écraserait à l'ouverture ;
2. seconde copie ouverte par SQLite : état ACTIF de la base (WAL rejoué), qui sert de
   référence ;
3. carving (`recovery/carver.py`) : anciennes versions de pages (WAL, journal), pages
   libres, espace non alloué et blocs libres des pages de table ;
4. chaque enregistrement retrouvé est normalisé par la MÊME fonction que les lignes actives
   (`sqlite_native.map_*`) puis comparé aux données actives :
   - fait identique à une ligne active → écarté (copie ou ancienne version sans différence
     significative : déplacement de cellule, changement de l'indicateur « lu »…) ;
   - même identifiant de ligne qu'une ligne active, contenu différent → `version_anterieure` ;
   - sinon → `absent` (absent des données actives : supprimé, ou remplacé par une modification).

Un même enregistrement lu à plusieurs emplacements n'est produit qu'une fois, avec la liste
des emplacements (page, trame WAL, décalage). La date de SUPPRESSION n'est jamais connue :
seul l'horodatage propre à l'enregistrement l'est.

Limite essentielle (consignée dans le rapport) : la bibliothèque SQLite d'Android est
compilée avec l'effacement sécurisé (`SQLITE_SECURE_DELETE`) et les bases système en
« auto-vacuum » : dans ces bases, les cellules supprimées sont remises à zéro et les pages
libérées tronquées. La récupération y repose alors surtout sur les journaux WAL / rollback.
Les applications embarquant leur propre SQLite peuvent se comporter différemment. Une
absence de résultat ne prouve donc pas l'absence de suppression.
"""
from __future__ import annotations

import shutil
import sqlite3
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from veritrace import __version__
from veritrace.core.timeutil import utc_now_iso
from veritrace.parsing.base import RunContext, ToolWrapper, WrapperResult, new_artifact
from veritrace.parsing.sqlite_native import (
    SIDECARS, Source, WaContext, browser_name, collect_sources, map_call, map_messenger, map_sms, map_url,
    map_viber_call, map_viber_message, map_wa_call, map_wa_legacy, map_wa_message, open_copy,
    parse_whatsapp_contacts, viber_numbers, wa_app,
)
from veritrace.recovery.carver import METHOD_RANK, Carved, Carver, TableSpec, affinity
from veritrace.recovery.sqlite_format import FormatError, journal_pages, load_image
from veritrace.schema.facts import fact_hash

ENGINE = "veritrace-recover"
TOOL = {"name": ENGINE, "version": __version__}
CONF_ORDER = ("elevee", "moyenne", "faible")
STATUS_FR = {"absent": "absent des données actives", "version_anterieure": "version antérieure"}

#: kind (sqlite_native.classify) → {table : fonction de normalisation (ligne, contexte)}
TARGETS: dict[str, dict[str, Callable[[dict, Any], Any]]] = {
    "sms": {"sms": lambda r, c: map_sms(r)},
    "calllog": {"calls": lambda r, c: map_call(r)},
    "contacts": {"calls": lambda r, c: map_call(r)},
    "browser": {"urls": lambda r, c: map_url(r, c)},
    "whatsapp": {"message": map_wa_message, "call_log": map_wa_call, "messages": map_wa_legacy},
    "viber_messages": {"messages": map_viber_message},
    "viber_data": {"calls": lambda r, c: map_viber_call(r)},
    "messenger": {"messages": lambda r, c: map_messenger(r)},
}


def table_specs(con: sqlite3.Connection) -> list[TableSpec]:
    """Toutes les tables à rowid de la base (servent à attribuer sans ambiguïté une cellule à sa table)."""
    specs = []
    for name, root, sql in con.execute("SELECT name, rootpage, sql FROM sqlite_master WHERE type='table'"):
        if not root or "WITHOUT ROWID" in (sql or "").upper() or name.startswith("sqlite_"):
            continue
        info = con.execute(f'PRAGMA table_info("{name}")').fetchall()
        pk = [r for r in info if r[5]]
        rowid_col = pk[0][0] if len(pk) == 1 and (pk[0][2] or "").upper() == "INTEGER" else None
        specs.append(TableSpec(name, root, [r[1] for r in info], [affinity(r[2]) for r in info], rowid_col))
    return specs


def _context(kind: str, con: sqlite3.Connection, src: Source, wa_names: dict[str, dict[str, str]]) -> Any:
    if kind == "whatsapp":
        return WaContext.load(con, wa_app(src), wa_names.get(str(PurePosixPath(src.rel).parent), {}))
    if kind == "viber_messages":
        return viber_numbers(con)
    if kind == "browser":
        return browser_name(src)
    return None


def _confidence(c: Carved) -> str:
    level = 0 if c.exact_cell and not c.by_signature and c.method not in ("bloc_libre", "wal_non_valide") else 1
    if c.truncated:
        level += 1
    return CONF_ORDER[min(level, 2)]


@dataclass
class Recovered:
    category: str
    timestamp: str | None
    data: dict[str, Any]
    status: str
    table: str
    rowid: int | None
    best: Carved
    confidence: str
    truncated: bool
    locations: list[str] = field(default_factory=list)


def _raw_copy(src: Path, dest_dir: Path) -> dict[str, Path]:
    """Copie octet pour octet de la base et de ses annexes, en lecture seule."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = {}
    for suffix in ("",) + SIDECARS[:2]:
        f = src.with_name(src.name + suffix)
        if f.is_file():
            d = dest_dir / f.name
            shutil.copyfile(f, d)
            d.chmod(0o444)
            out[suffix] = d
    return out


def recover_database(src: Source, index: int, work: Path, wa_names: dict[str, dict[str, str]]
                     ) -> tuple[list[Recovered], dict[str, Any]]:
    """Récupère les enregistrements d'une base ; renvoie (enregistrements, bilan)."""
    targets = TARGETS[src.kind]
    raw = _raw_copy(src.path, work / "raw" / str(index))
    img = load_image(raw[""], raw.get("-wal"))
    jpages, jstate = ([], None)
    if "-journal" in raw:
        jpages, jstate = journal_pages(raw["-journal"], img.page_size, len(img.pages))
    con, _ = open_copy(src.path, work / "live", index)
    try:
        specs = table_specs(con)
        tables = {s.name for s in specs} & set(targets)
        ctx = _context(src.kind, con, src, wa_names)
        live_facts: dict[str, set[str]] = {}
        live_rowids: dict[str, set[int]] = {}
        for t in tables:
            facts, rowids = set(), set()
            for r in con.execute(f'SELECT rowid AS __rowid__, * FROM "{t}"'):
                d = dict(r)
                rowids.add(d.pop("__rowid__"))
                m = targets[t](d, ctx)
                if m:
                    facts.add(fact_hash(m[0], m[2], m[1]))
            live_facts[t], live_rowids[t] = facts, rowids
        carver = Carver(img, specs, tables)
        carved = carver.carve(jpages)
        found: dict[str, Recovered] = {}
        already = 0
        for c in sorted(carved, key=lambda c: (METHOD_RANK[c.method], c.pgno, c.offset)):
            try:
                m = targets[c.table](dict(c.values), ctx)
            except (TypeError, ValueError, AttributeError, KeyError):
                m = None
            if not m:
                continue
            category, ts, data = m
            fact = fact_hash(category, data, ts)
            if fact in live_facts[c.table]:
                already += 1
                continue
            status = "version_anterieure" if c.rowid is not None and c.rowid in live_rowids[c.table] else "absent"
            key = fact_hash(category, data, ts, status)
            conf = _confidence(c)
            rec = found.get(key)
            if rec is None:
                found[key] = Recovered(category, ts, data, status, c.table, c.rowid, c, conf, c.truncated,
                                       [c.location])
            else:  # même enregistrement lu ailleurs : on garde la lecture la plus fiable, tous les emplacements
                if c.location not in rec.locations:
                    rec.locations.append(c.location)
                if rec.rowid is None and c.rowid is not None:
                    rec.rowid = c.rowid
                if CONF_ORDER.index(conf) < CONF_ORDER.index(rec.confidence):
                    rec.confidence, rec.best = conf, c
    finally:
        con.close()
    st = carver.stats
    recs = list(found.values())
    stats = {
        "database": src.rel, "page_size": img.page_size, "pages": len(img.pages), "auto_vacuum": img.auto_vacuum,
        "wal_frames": img.wal_frames, "wal_committed_frames": img.wal_committed, "journal": jstate,
        "journal_pages": len(jpages), "freelist_pages": st.freelist_pages, "free_bytes": st.free_bytes,
        "nonzero_free_bytes": st.nonzero_free_bytes, "secure_delete_observed": st.secure_delete_pages > 0,
        "recovered_absent": sum(r.status == "absent" for r in recs),
        "recovered_previous": sum(r.status == "version_anterieure" for r in recs),
        "already_active": already, "ambiguous": st.ambiguous,
        "by_method": dict(Counter(r.best.method for r in recs)), "notes": list(img.notes),
    }
    return recs, stats


def to_artifact(rec: Recovered, local_id: str, src: Source, ctx: RunContext) -> dict[str, Any]:
    ref = f"{rec.table}:rowid={rec.rowid}" if rec.rowid is not None else f"{rec.table}:rowid inconnu"
    a = new_artifact(artifact_id=local_id, category=rec.category, timestamp=rec.timestamp, tool=TOOL,
                     item_id=ctx.item_id, data=rec.data, run_id=ctx.run_id, file_path=src.rel,
                     record_ref=f"{ref} — {rec.locations[0]}", tags=["recupere"])
    a["x_veritrace"]["fact_sha256"] = fact_hash(rec.category, rec.data, rec.timestamp, rec.status)
    a["x_veritrace"]["recovery"] = {
        "status": rec.status, "method": rec.best.method, "confidence": rec.confidence, "database": src.rel,
        "table": rec.table, "rowid": rec.rowid, "truncated": rec.truncated, "locations": rec.locations}
    return a


def _limitations(stats: list[dict[str, Any]]) -> list[str]:
    out = []
    for s in stats:
        if s["secure_delete_observed"]:
            out.append(f"Récupération — {s['database']} : blocs libres remis à zéro (effacement sécurisé SQLite) ; "
                       "les cellules supprimées des pages actives ne sont pas récupérables, seules les versions "
                       "antérieures de pages (WAL / journal) ont pu être examinées.")
    return out


class RecoverWrapper(ToolWrapper):
    key = ENGINE
    name = ENGINE

    def run(self, extraction: Path, out_dir: Path, ctx: RunContext) -> WrapperResult:
        started = utc_now_iso()
        work = out_dir / "work"
        work.mkdir(parents=True, exist_ok=True)
        sources = [s for s in collect_sources(extraction, work) if s.kind in TARGETS or s.kind == "whatsapp_contacts"]
        wa_names: dict[str, dict[str, str]] = {}
        for i, s in enumerate(sources):
            if s.kind == "whatsapp_contacts":
                con, _ = open_copy(s.path, work / "contacts", i)
                try:
                    wa_names[str(PurePosixPath(s.rel).parent)] = parse_whatsapp_contacts(con, s, lambda *a: None)[1]
                except sqlite3.DatabaseError:
                    pass
                finally:
                    con.close()
        artifacts: list[dict[str, Any]] = []
        all_stats: list[dict[str, Any]] = []
        notes: list[str] = []
        dbs = [s for s in sources if s.kind in TARGETS]
        for i, src in enumerate(dbs):
            try:
                recs, stats = recover_database(src, i, work, wa_names)
            except (FormatError, sqlite3.DatabaseError) as exc:
                notes.append(f"{src.rel} : non examinée ({exc}).")
                continue
            stats.update(run_id=ctx.run_id, item_id=ctx.item_id)
            all_stats.append(stats)
            recs.sort(key=lambda r: (r.timestamp or "", r.table, r.rowid or 0))
            for rec in recs:
                artifacts.append(to_artifact(rec, f"L{len(artifacts) + 1}", src, ctx))
        absent = sum(s["recovered_absent"] for s in all_stats)
        previous = sum(s["recovered_previous"] for s in all_stats)
        notes.insert(0, f"{len(all_stats)} base(s) examinée(s) ; {absent} enregistrement(s) absent(s) des données "
                        f"actives et {previous} version(s) antérieure(s) récupéré(s).")
        if any(s["already_active"] for s in all_stats):
            notes.append(f"{sum(s['already_active'] for s in all_stats)} lecture(s) identique(s) à des données "
                         "actives écartée(s).")
        if not dbs:
            notes.append("Aucune base prise en charge (mmssms.db, calllog.db, History, WhatsApp, Viber, Messenger).")
        limitations = _limitations(all_stats)
        return WrapperResult(tool=TOOL, mode="execute", command=["veritrace", "parse", "recover"], started_at=started,
                             ended_at=utc_now_iso(), output_path=None, artifacts=artifacts, notes=notes,
                             limitations=limitations, recovery_stats=all_stats)
