"""Récupération d'enregistrements SQLite hors des données actives (« carving »).

Sources examinées, de la plus fiable à la moins fiable :

| Méthode | Où | Cellule | Table | Identifiant de ligne |
|---|---|---|---|---|
| `wal` / `wal_non_valide` / `journal` | anciennes versions de pages (journal WAL, journal de rollback) | intacte | page + signature | connu |
| `page_libre` | pages de la liste des pages libres | intacte | signature | connu |
| `espace_non_alloue` | zone non allouée d'une page de table active | intacte | page | connu |
| `bloc_libre` | blocs libres d'une page de table (cellules supprimées) | 4 premiers octets écrasés | page / signature | inconnu |

« Signature » : nombre de colonnes et compatibilité de chaque type stocké avec l'affinité
déclarée de la colonne. Une cellule dont la table ne peut être déterminée sans ambiguïté
est écartée (comptée, jamais devinée).

Le module ne fait que LIRE des octets ; il ne décide pas si un enregistrement est supprimé :
c'est la comparaison avec les données actives (wrapper `veritrace-recover`) qui le qualifie.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterator

from veritrace.recovery.sqlite_format import (
    INTERIOR_TABLE, LEAF_TABLE, Cell, DbImage, FormatError, PageVersion, body_size, decode_body, free_regions, leaf_cells,
    page_header, read_types, varint,
)

METHOD_RANK = {"wal": 0, "journal": 1, "wal_non_valide": 2, "page_libre": 3, "espace_non_alloue": 4, "bloc_libre": 5}
_PRINTABLE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


@dataclass
class TableSpec:
    name: str
    root: int
    columns: list[str]
    affinities: list[str]          # INTEGER | TEXT | REAL | NUMERIC | BLOB
    rowid_col: int | None          # colonne INTEGER PRIMARY KEY (alias du rowid), stockée NULL

    @property
    def ncols(self) -> int:
        return len(self.columns)


def affinity(decl: str | None) -> str:
    d = (decl or "").upper()
    if "INT" in d:
        return "INTEGER"
    if any(k in d for k in ("CHAR", "CLOB", "TEXT")):
        return "TEXT"
    if not d or "BLOB" in d:
        return "BLOB"
    if any(k in d for k in ("REAL", "FLOA", "DOUB")):
        return "REAL"
    return "NUMERIC"


def compatible(t: int, aff: str) -> bool:
    if t == 0:
        return True
    is_num, is_text = t <= 9, t >= 13 and t % 2 == 1
    if aff in ("INTEGER", "REAL"):
        return is_num
    if aff == "TEXT":
        return is_text                 # un BLOB dans une colonne TEXT : signature écartée (zéros pris pour du contenu)
    if aff == "NUMERIC":
        return is_num or is_text
    return True


def signature_ok(types: list[int], spec: TableSpec, *, exact: bool) -> bool:
    n = len(types)
    if n > spec.ncols or n == 0 or (exact and n != spec.ncols) or n < (spec.ncols + 1) // 2:
        return False
    if spec.rowid_col is not None and spec.rowid_col < n and types[spec.rowid_col] != 0:
        return False
    return all(compatible(t, spec.affinities[i]) for i, t in enumerate(types))


@dataclass
class Carved:
    table: str
    values: dict[str, object]
    rowid: int | None
    method: str
    pgno: int
    offset: int
    frame: int | None = None
    truncated: bool = False
    exact_cell: bool = True        # cellule intacte (en-tête complet)
    by_signature: bool = False     # table déduite de la signature (et non de la page)

    @property
    def location(self) -> str:
        where = {"wal": f"trame WAL {self.frame} (version remplacée de la page {self.pgno})",
                 "wal_non_valide": f"trame WAL non validée {self.frame} (page {self.pgno})",
                 "journal": f"journal de rollback (image de la page {self.pgno})",
                 "page_libre": f"page libre {self.pgno}",
                 "espace_non_alloue": f"espace non alloué de la page {self.pgno}",
                 "bloc_libre": f"bloc libre de la page {self.pgno}"}[self.method]
        if self.method == "wal" and self.frame is None:
            where = f"fichier principal (version de la page {self.pgno} remplacée par le journal WAL)"
        return f"{where}, décalage 0x{self.offset:04X}"


@dataclass
class CarveStats:
    pages: int = 0
    table_pages: int = 0
    freelist_pages: int = 0
    superseded_pages: int = 0
    journal_pages: int = 0
    free_regions: int = 0
    free_bytes: int = 0
    nonzero_free_bytes: int = 0
    secure_delete_pages: int = 0
    ambiguous: int = 0


class Carver:
    def __init__(self, img: DbImage, specs: list[TableSpec], targets: set[str] | None = None) -> None:
        self.img = img
        self.specs = specs
        self.targets = targets if targets is not None else {s.name for s in specs}
        self.owner: dict[int, TableSpec] = {}
        for s in specs:
            for pg in img.btree_pages(s.root):
                self.owner[pg] = s
        self.stats = CarveStats(pages=len(img.pages))

    # ------------------------------------------------------------------ décodage
    def _decode(self, payload: bytes, overflow: bytes = b"", strict: bool = False):
        hlen, n = varint(payload, 0)
        if hlen < n or hlen > len(payload):
            raise FormatError("en-tête d'enregistrement incohérent")
        types, pos = read_types_until(payload, n, hlen)
        values, _, truncated = decode_body(payload, hlen, types, len(payload), self.img.encoding, overflow)
        return types, values, truncated

    def _values(self, spec: TableSpec, values: list, rowid: int | None) -> dict[str, object]:
        out = {c: (values[i] if i < len(values) else None) for i, c in enumerate(spec.columns)}
        if spec.rowid_col is not None and rowid is not None:
            out[spec.columns[spec.rowid_col]] = rowid
        return out

    def _attribute(self, types: list[int], pgno: int, specs: list[TableSpec], *,
                   exact: bool) -> tuple[TableSpec | None, bool]:
        """Table d'un enregistrement : celle qui possède la page si la signature concorde, sinon
        l'unique table de signature compatible ; (None, …) si aucune ou plusieurs (ambiguïté comptée)."""
        own = self.owner.get(pgno)
        if own in specs and signature_ok(types, own, exact=exact):
            return own, False
        cands = [s for s in specs if signature_ok(types, s, exact=exact)]
        best = [s for s in cands if s.ncols == len(types)] or cands
        if len(best) == 1:
            return best[0], True
        if best:
            self.stats.ambiguous += 1
        return None, True

    # ------------------------------------------------------------------ cellules intactes
    def _intact(self, page: bytes, pgno: int, method: str, frame: int | None) -> Iterator[Carved]:
        usable = self.img.usable
        for cell in leaf_cells(page, pgno, usable):
            yield from self._from_cell(cell, pgno, method, frame)

    def _from_cell(self, cell: Cell, pgno: int, method: str, frame: int | None) -> Iterator[Carved]:
        need = cell.payload_size - len(cell.local)
        ovf = self.img.overflow(cell.overflow_page, need) if need > 0 else b""
        try:
            types, values, truncated = self._decode(cell.local, ovf)
        except (FormatError, UnicodeDecodeError):
            try:  # débordement réutilisé depuis : on ne garde que la partie locale
                types, values, truncated = self._decode(cell.local)
            except (FormatError, UnicodeDecodeError):
                return
        spec, by_sig = self._attribute(types, pgno, self.specs, exact=False)
        if spec is None or spec.name not in self.targets:
            return
        yield Carved(spec.name, self._values(spec, values, cell.rowid), cell.rowid, method, pgno, cell.offset,
                     frame, truncated or (need > 0 and len(ovf) < need), by_signature=by_sig)

    # ------------------------------------------------------------------ zones libres
    def _region_records(self, page: bytes, pgno: int, start: int, end: int, specs: list[TableSpec],
                        method: str) -> Iterator[Carved]:
        p = start
        while p < end - 2:
            if page[p] == 0:  # octet nul : ni début de cellule ni en-tête exploitable (voir mode « sans_rowid »)
                p += 1
                continue
            hit = self._try_at(page, pgno, p, end, specs, method)
            if hit:
                rec, nxt = hit
                yield rec
                p = max(nxt, p + 1)
            else:
                p += 1

    def _try_at(self, page: bytes, pgno: int, p: int, end: int, specs: list[TableSpec], method: str):
        enc = self.img.encoding
        # 1. cellule complète : longueur, rowid, en-tête, types, corps
        try:
            plen, a = varint(page, p, end)
            rowid, b = varint(page, p + a, end)
            h = p + a + b
            hlen, c = varint(page, h, end)
            if 2 <= hlen <= 9 * 128 and 0 < plen <= self.img.usable * 64:
                types = read_types_until(page[h:h + hlen], c, hlen)[0]
                if hlen + body_size(types) == plen:
                    spec, by_sig = self._attribute(types, pgno, specs, exact=True)
                    if spec and spec.name in self.targets:
                        local_end = min(end, h + plen)
                        values, stop, trunc = decode_body(page, h + hlen, types, local_end, enc)
                        if self._plausible(values, spec):
                            return Carved(spec.name, self._values(spec, values, rowid), rowid, method, pgno, p,
                                          truncated=trunc, by_signature=by_sig), stop
        except (FormatError, UnicodeDecodeError):
            pass
        # 2. en-tête d'enregistrement intact (longueur + types) ; 3. types seuls ; 4. types sans la 1re colonne
        #    (cellule dont les 4 premiers octets ont été écrasés par le chaînage des blocs libres)
        # Toutes les tables candidates sont essayées : si plusieurs structures concordent, la cellule
        # est ambiguë et n'est attribuée à aucune (comptée), même si une seule d'entre elles est utile.
        own = self.owner.get(pgno)
        for mode in ("hdr", "types", "sans_rowid"):
            hits: list[tuple[TableSpec, list, int]] = []
            for spec in specs:
                parsed = self._partial(page, p, end, spec, mode)
                if parsed:
                    hits.append((spec, *parsed))
            if own is not None and any(h[0] is own for h in hits):
                hits = [h for h in hits if h[0] is own]
            if len(hits) > 1:
                self.stats.ambiguous += 1
                return None
            if hits:
                spec, values, stop = hits[0]
                if spec.name not in self.targets:
                    return None
                return Carved(spec.name, self._values(spec, values, None), None, method, pgno, p,
                              exact_cell=False, by_signature=spec is not own), stop
        return None

    def _partial(self, page: bytes, p: int, end: int, spec: TableSpec, mode: str) -> tuple[list, int] | None:
        """Enregistrement à en-tête partiel à la position `p` selon `mode` ; None si incohérent."""
        try:
            q, n = p, spec.ncols
            if mode == "hdr":
                hlen, c = varint(page, p, end)
                q = p + c
            elif mode == "sans_rowid":
                if spec.rowid_col != 0:
                    return None
                n -= 1
            types, body = read_types(page, q, n, end)
            if mode == "hdr" and body - p != hlen:
                return None
            if mode == "sans_rowid":
                types = [0] + types
            if not signature_ok(types, spec, exact=True) or body + body_size(types) > end:
                return None
            values, stop, _ = decode_body(page, body, types, end, self.img.encoding)
        except (FormatError, UnicodeDecodeError):
            return None
        return (values, stop) if self._plausible(values, spec) else None

    @staticmethod
    def _plausible(values: list, spec: TableSpec) -> bool:
        """Au moins deux valeurs renseignées hors identifiant, dont un texte lisible non vide ou deux
        nombres non nuls ; textes sans caractère de contrôle ; pas de BLOB entièrement nul."""
        filled = [v for i, v in enumerate(values) if v is not None and i != spec.rowid_col]
        if len(filled) < 2:
            return False
        texts = 0
        for v in filled:
            if isinstance(v, str):
                if _PRINTABLE.search(v) or (v and not v.strip()):
                    return False
                texts += bool(v)
            elif isinstance(v, bytes) and v and not any(v):
                return False
        return texts >= 1 or sum(1 for v in filled if isinstance(v, (int, float)) and v) >= 2

    # ------------------------------------------------------------------ parcours
    def carve(self, extra_versions: list[PageVersion] | None = None) -> list[Carved]:
        out: list[Carved] = []
        img, usable = self.img, self.img.usable
        # (a) pages de table actives : espace non alloué + blocs libres
        for pgno, spec in sorted(self.owner.items()):
            if spec.name not in self.targets:
                continue
            page = img.pages.get(pgno)
            h = page_header(page, pgno) if page else None
            if not h or h.kind not in (LEAF_TABLE, INTERIOR_TABLE):
                continue
            self.stats.table_pages += 1
            regions, zeroed = free_regions(page, pgno, usable)
            self.stats.secure_delete_pages += zeroed
            for r in regions:
                self._count_region(page, r.start, r.end)
                start = r.start + 4 if r.kind == "bloc_libre" else r.start
                out += self._region_records(page, pgno, start, r.end, [spec], r.kind)
        # (b) pages libres : feuilles de table encore lisibles ; pages « tronc » (seul leur début est
        #     réécrit par la liste des pages libres, le reste conserve l'ancien contenu)
        for pgno, role in img.freelist_pages():
            self.stats.freelist_pages += 1
            page = img.pages[pgno]
            if role == "tronc":
                n = min(int.from_bytes(page[4:8], "big"), (usable - 8) // 4)
                self._count_region(page, 8 + 4 * n, usable)
                out += self._region_records(page, pgno, 8 + 4 * n, usable, self.specs, "page_libre")
            elif page[0] == LEAF_TABLE:
                out += self._intact(page, pgno, "page_libre", None)
                regions, _ = free_regions(page, pgno, usable)
                for r in regions:
                    start = r.start + 4 if r.kind == "bloc_libre" else r.start
                    out += self._region_records(page, pgno, start, r.end, self.specs, "page_libre")
        # (c) versions antérieures de pages (WAL, journal)
        for v in list(img.superseded) + list(extra_versions or []):
            if v.origin == "journal":
                self.stats.journal_pages += 1
            else:
                self.stats.superseded_pages += 1
            h = page_header(v.data, v.pgno)
            if h and h.kind == LEAF_TABLE:
                out += self._intact(v.data, v.pgno, v.origin if v.origin != "fichier" else "wal", v.frame)
        return out

    def _count_region(self, page: bytes, start: int, end: int) -> None:
        self.stats.free_regions += 1
        self.stats.free_bytes += end - start
        self.stats.nonzero_free_bytes += sum(1 for b in page[start:end] if b)


def read_types_until(buf: bytes, off: int, end: int) -> tuple[list[int], int]:
    """Types de série de `off` jusqu'à `end` (fin de l'en-tête d'enregistrement)."""
    types, pos = [], off
    while pos < end:
        t, n = varint(buf, pos, end)
        read_types(buf, pos, 1, end)
        types.append(t)
        pos += n
    if pos != end:
        raise FormatError("en-tête d'enregistrement incohérent")
    return types, pos
