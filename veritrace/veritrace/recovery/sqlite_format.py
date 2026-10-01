"""Lecture BRUTE du format de fichier SQLite 3 (sans passer par la bibliothèque SQLite).

Référence : https://www.sqlite.org/fileformat2.html. Seule la lecture est implémentée ;
aucune fonction de ce module n'écrit dans un fichier.

- `varint`, `parse_record` : enregistrements (en-tête de types + corps) ;
- `DbImage` : fichier principal + journal WAL → pages ACTIVES (état visible par SQLite)
  et versions de pages REMPLACÉES (anciennes trames WAL, trames non validées, pages du
  fichier principal masquées par le WAL) ;
- `journal_pages` : images de pages d'un journal de rollback (`-journal`), y compris en
  mode PERSIST (en-tête mis à zéro mais pages conservées) ;
- `leaf_cells` / `free_regions` : cellules d'une page feuille de table, blocs libres et
  espace non alloué de la page.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

MAGIC = b"SQLite format 3\x00"
WAL_MAGIC = (0x377F0682, 0x377F0683)
JOURNAL_MAGIC = bytes.fromhex("d9d505f920a163d7")
LEAF_TABLE, INTERIOR_TABLE, LEAF_INDEX, INTERIOR_INDEX = 0x0D, 0x05, 0x0A, 0x02


class FormatError(ValueError):
    """Fichier ou structure non conforme au format SQLite."""


# --------------------------------------------------------------------------- enregistrements
def varint(buf: bytes, off: int, end: int | None = None) -> tuple[int, int]:
    """Entier de longueur variable (1 à 9 octets) ; renvoie (valeur, longueur). FormatError si tronqué."""
    end = len(buf) if end is None else min(end, len(buf))
    v = 0
    for i in range(9):
        if off + i >= end:
            raise FormatError("varint tronqué")
        b = buf[off + i]
        if i == 8:
            return (v << 8) | b, 9
        v = (v << 7) | (b & 0x7F)
        if b < 0x80:
            return v, i + 1
    raise FormatError("varint invalide")  # pragma: no cover


def serial_size(t: int) -> int:
    if t in (0, 8, 9, 12, 13):
        return 0
    if 1 <= t <= 4:
        return t
    if t == 5:
        return 6
    if t in (6, 7):
        return 8
    if t in (10, 11):
        raise FormatError("type de série réservé")
    return (t - 12) // 2 if t % 2 == 0 else (t - 13) // 2


def decode_value(t: int, raw: bytes, encoding: str):
    if t == 0:
        return None
    if 1 <= t <= 6:
        return int.from_bytes(raw, "big", signed=True)
    if t == 7:
        return struct.unpack(">d", raw)[0]
    if t == 8:
        return 0
    if t == 9:
        return 1
    if t >= 12 and t % 2 == 0:
        return bytes(raw)
    return raw.decode(encoding)  # UnicodeDecodeError : contrôlé par l'appelant


def read_types(buf: bytes, off: int, count: int, end: int) -> tuple[list[int], int]:
    """`count` types de série consécutifs à partir de `off` ; renvoie (types, position suivante)."""
    types = []
    for _ in range(count):
        t, n = varint(buf, off, end)
        serial_size(t)  # rejette 10 / 11
        types.append(t)
        off += n
    return types, off


def decode_body(buf: bytes, off: int, types: list[int], end: int, encoding: str,
                overflow: bytes = b"") -> tuple[list, int, bool]:
    """Décode le corps ; renvoie (valeurs, fin, tronqué). Les valeurs hors de la zone lisible valent None."""
    data = buf[off:end] + overflow
    values, pos, truncated = [], 0, False
    for t in types:
        size = serial_size(t)
        if pos + size > len(data):
            values.append(None)
            truncated = True
            pos += size
            continue
        values.append(decode_value(t, data[pos:pos + size], encoding))
        pos += size
    return values, off + pos, truncated


def body_size(types: list[int]) -> int:
    return sum(serial_size(t) for t in types)


# --------------------------------------------------------------------------- pages
@dataclass
class PageHeader:
    kind: int
    first_freeblock: int
    cells: int
    content_start: int
    fragmented: int
    right_ptr: int | None
    size: int            # 8 (feuille) ou 12 (intérieure)


def page_header(page: bytes, pgno: int) -> PageHeader | None:
    base = 100 if pgno == 1 else 0
    if len(page) < base + 8:
        return None
    kind = page[base]
    if kind not in (LEAF_TABLE, INTERIOR_TABLE, LEAF_INDEX, INTERIOR_INDEX):
        return None
    fb, ncell, start, frag = struct.unpack(">HHHB", page[base + 1: base + 8])
    right = struct.unpack(">I", page[base + 8: base + 12])[0] if kind in (INTERIOR_TABLE, INTERIOR_INDEX) else None
    return PageHeader(kind, fb, ncell, start or 65536, frag, right, 12 if right is not None else 8)


def cell_pointers(page: bytes, pgno: int, h: PageHeader) -> list[int]:
    base = (100 if pgno == 1 else 0) + h.size
    end = base + 2 * h.cells
    if end > len(page):
        return []
    return [struct.unpack(">H", page[base + 2 * i: base + 2 * i + 2])[0] for i in range(h.cells)]


def local_payload(p: int, usable: int) -> int:
    """Octets du contenu stockés dans la page (feuille de table) ; le reste est en débordement."""
    x = usable - 35
    if p <= x:
        return p
    m = ((usable - 12) * 32 // 255) - 23
    k = m + ((p - m) % (usable - 4))
    return k if k <= x else m


@dataclass
class Cell:
    offset: int
    rowid: int
    payload_size: int
    local: bytes
    overflow_page: int | None


def leaf_cells(page: bytes, pgno: int, usable: int) -> Iterator[Cell]:
    """Cellules (intactes) d'une page feuille de table, via le tableau de pointeurs."""
    h = page_header(page, pgno)
    if not h or h.kind != LEAF_TABLE:
        return
    for ptr in cell_pointers(page, pgno, h):
        if not 0 < ptr < usable:
            continue
        try:
            plen, a = varint(page, ptr, usable)
            rowid, b = varint(page, ptr + a, usable)
        except FormatError:
            continue
        loc = local_payload(plen, usable)
        start = ptr + a + b
        if start + loc > usable:
            continue
        ovf = None
        if loc < plen and start + loc + 4 <= usable:
            ovf = struct.unpack(">I", page[start + loc: start + loc + 4])[0]
        yield Cell(ptr, rowid, plen, page[start:start + loc], ovf)


@dataclass
class FreeRegion:
    kind: str            # bloc_libre | espace_non_alloue
    start: int
    end: int


def free_regions(page: bytes, pgno: int, usable: int) -> tuple[list[FreeRegion], bool]:
    """Blocs libres et espace non alloué d'une page de table (feuille ou intérieure : une page
    intérieure a souvent été une feuille avant un rééquilibrage et en conserve d'anciennes cellules).

    Renvoie aussi un indicateur « effacement sécurisé constaté » : blocs libres présents et
    entièrement remis à zéro (option SQLite secure_delete).
    """
    h = page_header(page, pgno)
    if not h or h.kind not in (LEAF_TABLE, INTERIOR_TABLE):
        return [], False
    regions: list[FreeRegion] = []
    hdr_end = (100 if pgno == 1 else 0) + h.size + 2 * h.cells
    if h.content_start > hdr_end:
        regions.append(FreeRegion("espace_non_alloue", hdr_end, min(h.content_start, usable)))
    seen, fb, zeroed, blocks = set(), h.first_freeblock, True, 0
    while fb and fb not in seen and fb + 4 <= usable:
        seen.add(fb)
        nxt, size = struct.unpack(">HH", page[fb: fb + 4])
        if size < 4 or fb + size > usable:
            break
        regions.append(FreeRegion("bloc_libre", fb, fb + size))
        blocks += 1
        if any(page[fb + 4: fb + size]):
            zeroed = False
        fb = nxt
    return regions, bool(blocks) and zeroed


# --------------------------------------------------------------------------- base + WAL
@dataclass
class PageVersion:
    pgno: int
    data: bytes
    origin: str          # fichier | wal | wal_non_valide | journal
    frame: int | None = None


@dataclass
class DbImage:
    """État d'une base reconstitué à partir du fichier principal et de son journal WAL."""

    page_size: int
    reserved: int
    encoding: str
    pages: dict[int, bytes]                       # état actif (fichier + trames WAL validées)
    page_origin: dict[int, str]
    superseded: list[PageVersion] = field(default_factory=list)
    wal_frames: int = 0
    wal_committed: int = 0
    auto_vacuum: bool = False
    freelist_trunk: int = 0
    freelist_count: int = 0
    notes: list[str] = field(default_factory=list)

    @property
    def usable(self) -> int:
        return self.page_size - self.reserved

    def get(self, pgno: int) -> bytes | None:
        return self.pages.get(pgno)

    def overflow(self, first: int | None, need: int) -> bytes:
        """Données de débordement (chaîne de pages) dans l'état actif ; tronquées si la chaîne est rompue."""
        out, seen, pg = b"", set(), first
        while pg and pg not in seen and len(out) < need:
            seen.add(pg)
            data = self.pages.get(pg)
            if not data:
                break
            nxt = struct.unpack(">I", data[:4])[0]
            out += data[4:self.usable]
            pg = nxt
        return out[:need]

    def freelist_pages(self) -> list[tuple[int, str]]:
        """Pages libres : [(numéro, 'tronc' | 'feuille')]."""
        out, seen, trunk = [], set(), self.freelist_trunk
        while trunk and trunk not in seen and trunk in self.pages:
            seen.add(trunk)
            data = self.pages[trunk]
            out.append((trunk, "tronc"))
            nxt, n = struct.unpack(">II", data[:8])
            n = min(n, (self.usable - 8) // 4)
            for i in range(n):
                leaf = struct.unpack(">I", data[8 + 4 * i: 12 + 4 * i])[0]
                if leaf in self.pages:
                    out.append((leaf, "feuille"))
            trunk = nxt
        return out

    def btree_pages(self, root: int) -> set[int]:
        """Pages d'un arbre de table (intérieures + feuilles) dans l'état actif."""
        seen: set[int] = set()
        stack = [root]
        while stack:
            pg = stack.pop()
            if pg in seen or pg not in self.pages:
                continue
            seen.add(pg)
            data = self.pages[pg]
            h = page_header(data, pg)
            if not h:
                continue
            if h.kind in (INTERIOR_TABLE, INTERIOR_INDEX):
                for ptr in cell_pointers(data, pg, h):
                    if ptr + 4 <= len(data):
                        stack.append(struct.unpack(">I", data[ptr: ptr + 4])[0])
                if h.right_ptr:
                    stack.append(h.right_ptr)
        return seen


def _wal_checksum(data: bytes, s0: int, s1: int, big: bool) -> tuple[int, int]:
    fmt = (">" if big else "<") + f"{len(data) // 4}I"
    words = struct.unpack(fmt, data)
    for i in range(0, len(words), 2):
        s0 = (s0 + words[i] + s1) & 0xFFFFFFFF
        s1 = (s1 + words[i + 1] + s0) & 0xFFFFFFFF
    return s0, s1


def load_image(db_path: Path, wal_path: Path | None = None) -> DbImage:
    raw = db_path.read_bytes()
    if raw[:16] != MAGIC:
        raise FormatError("en-tête SQLite absent (base chiffrée ou fichier d'un autre type)")
    page_size = struct.unpack(">H", raw[16:18])[0]
    page_size = 65536 if page_size == 1 else page_size
    reserved = raw[20]
    enc = {1: "utf-8", 2: "utf-16-le", 3: "utf-16-be"}.get(struct.unpack(">I", raw[56:60])[0], "utf-8")
    pages = {i + 1: raw[i * page_size:(i + 1) * page_size] for i in range(len(raw) // page_size)}
    origin = {p: "fichier" for p in pages}
    img = DbImage(page_size, reserved, enc, pages, origin,
                  auto_vacuum=struct.unpack(">I", raw[52:56])[0] != 0)
    if wal_path and wal_path.is_file() and wal_path.stat().st_size >= 32:
        _apply_wal(img, wal_path.read_bytes())
    p1 = img.pages.get(1, raw[:page_size])
    img.freelist_trunk, img.freelist_count = struct.unpack(">II", p1[32:40])
    return img


def _apply_wal(img: DbImage, wal: bytes) -> None:
    magic, _version, psize, _ckpt, salt1, salt2, c0, c1 = struct.unpack(">8I", wal[:32])
    if magic not in WAL_MAGIC or psize != img.page_size:
        img.notes.append("journal WAL illisible (en-tête ou taille de page inattendus) : non exploité")
        return
    big = magic == 0x377F0683
    s0, s1 = _wal_checksum(wal[:24], 0, 0, big)
    header_ok = (s0, s1) == (c0, c1)
    frame_size = 24 + psize
    frames: list[tuple[int, int, bytes, bool, bool]] = []    # (n°, page, données, valide, validation)
    valid_chain = header_ok
    for i in range((len(wal) - 32) // frame_size):
        off = 32 + i * frame_size
        pgno, commit, fs1, fs2, fc0, fc1 = struct.unpack(">6I", wal[off: off + 24])
        data = wal[off + 24: off + frame_size]
        ok = False
        if valid_chain and (fs1, fs2) == (salt1, salt2):
            s0, s1 = _wal_checksum(wal[off: off + 8] + data, s0, s1, big)
            ok = (s0, s1) == (fc0, fc1)
        valid_chain = valid_chain and ok
        frames.append((i + 1, pgno, data, ok, ok and commit != 0))
    img.wal_frames = len(frames)
    last_commit = max((i for i, (_, _, _, _, c) in enumerate(frames) if c), default=-1)
    img.wal_committed = last_commit + 1
    for idx, (n, pgno, data, ok, _) in enumerate(frames):
        if not pgno:
            continue
        if ok and idx <= last_commit:
            if pgno in img.pages:  # version précédente masquée par cette trame
                img.superseded.append(PageVersion(pgno, img.pages[pgno], img.page_origin[pgno],
                                                  None if img.page_origin[pgno] == "fichier" else
                                                  int(img.page_origin[pgno].split(":")[1])))
            img.pages[pgno] = data
            img.page_origin[pgno] = f"wal:{n}"
        else:  # trame non validée, d'une génération antérieure du WAL ou postérieure au dernier commit
            img.superseded.append(PageVersion(pgno, data, "wal_non_valide", n))
    for v in img.superseded:
        if v.origin.startswith("wal:"):
            v.origin = "wal"


def journal_pages(journal: Path, page_size: int, max_page: int) -> tuple[list[PageVersion], str]:
    """Images de pages d'un journal de rollback ; renvoie (pages, état de l'en-tête)."""
    raw = journal.read_bytes()
    if len(raw) < 512:
        return [], "vide"
    state = "valide" if raw[:8] == JOURNAL_MAGIC else ("remis_a_zero" if not any(raw[:28]) else "inconnu")
    sectors = [struct.unpack(">I", raw[20:24])[0]] if state == "valide" else [512, 1024, 2048, 4096]
    best: list[PageVersion] = []
    for sector in sectors:
        if not sector or sector > len(raw):
            continue
        out, off = [], sector
        while off + 4 + page_size + 4 <= len(raw):
            pgno = struct.unpack(">I", raw[off: off + 4])[0]
            if not 0 < pgno <= max_page + 1024:
                break
            out.append(PageVersion(pgno, raw[off + 4: off + 4 + page_size], "journal"))
            off += 8 + page_size
        if len(out) > len(best):
            best = out
    return best, state
