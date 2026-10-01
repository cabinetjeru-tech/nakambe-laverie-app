"""Journal d'audit horodaté, en ajout seul et chaîné par SHA-256.

Chaque action de l'examinateur produit une ligne JSON (JSONL) :

    {"seq": 3, "timestamp": "...", "examiner": "...", "action": "...",
     "details": {...}, "prev_hash": "<entry_hash de la ligne 2>", "entry_hash": "..."}

`entry_hash` = SHA-256 de la forme canonique de l'entrée sans `entry_hash`. Modifier,
supprimer ou réordonner une ligne casse la chaîne, ce que `verify()` détecte.

Ce qui est garanti / ce qui ne l'est pas
----------------------------------------
- Le code n'expose AUCUNE opération de modification ou de suppression : uniquement `append`.
- Le fichier est remis en lecture seule (0444) après chaque écriture pour éviter les
  modifications accidentelles.
- La chaîne rend toute altération *détectable* (tamper-evident). Un logiciel ne peut pas
  rendre un fichier physiquement immuable face à un administrateur du poste : la troncature
  des dernières lignes n'est détectable que si l'empreinte de tête (`head_hash`) a été
  consignée ailleurs. C'est pourquoi elle est reportée dans le JSON normalisé et imprimée
  dans les rapports. Pour une garantie forte, archivez le journal sur support WORM.
"""
from __future__ import annotations

import json
import os
import stat
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

from veritrace.core.hashing import sha256_json
from veritrace.core.timeutil import utc_now_iso

GENESIS_HASH = "0" * 64

try:  # Verrou inter-processus : fcntl (POSIX) ou msvcrt (Windows), posé sur un fichier « .lock » distinct.
    import fcntl

    def _lock(fh) -> None:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)

    def _unlock(fh) -> None:
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)

except ImportError:  # pragma: no cover - Windows : les verrous msvcrt sont IMPÉRATIFS (ils bloqueraient
    import msvcrt    # aussi la relecture du journal) : on verrouille donc un fichier « .lock » séparé.
    import time

    def _lock(fh) -> None:
        for _ in range(600):           # attend au plus ~60 s qu'un autre processus libère le journal
            try:
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
                return
            except OSError:
                time.sleep(0.1)
        raise AuditError("journal d'audit verrouillé par un autre processus")

    def _unlock(fh) -> None:
        fh.seek(0)
        msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)


class AuditError(RuntimeError):
    """Le journal est illisible ou sa chaîne d'intégrité est rompue."""


@dataclass
class VerificationResult:
    ok: bool
    entries: int
    head_hash: str
    problems: list[str] = field(default_factory=list)


def _entry_hash(entry: dict[str, Any]) -> str:
    return sha256_json({k: v for k, v in entry.items() if k != "entry_hash"})


class AuditLog:
    """Journal d'audit en ajout seul. Une instance par fichier."""

    def __init__(self, path: str | Path, examiner: str | None = None) -> None:
        self.path = Path(path)
        self.examiner = examiner or "inconnu"

    # -- lecture ---------------------------------------------------------------
    def entries(self) -> Iterator[dict[str, Any]]:
        if not self.path.exists():
            return
        with open(self.path, encoding="utf-8") as fh:
            for lineno, line in enumerate(fh, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError as exc:
                    raise AuditError(f"{self.path}:{lineno}: ligne JSON invalide ({exc})") from exc

    def _tail(self) -> tuple[int, str]:
        """(dernier seq, dernier entry_hash) — (0, GENESIS) si le journal est vide."""
        seq, head = 0, GENESIS_HASH
        for e in self.entries():
            seq, head = e.get("seq", seq), e.get("entry_hash", head)
        return seq, head

    # -- écriture --------------------------------------------------------------
    def append(self, action: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
        """Ajoute une entrée et renvoie l'entrée écrite (avec son empreinte)."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            # Le fichier est en 0444 entre deux écritures ; on rouvre le droit d'écriture
            # pour le seul propriétaire le temps de l'ajout.
            os.chmod(self.path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
        lock_path = self.path.with_name(self.path.name + ".lock")
        try:
            with open(lock_path, "a+") as lk, open(self.path, "a", encoding="utf-8") as fh:
                _lock(lk)
                try:
                    seq, prev = self._tail()
                    entry: dict[str, Any] = {
                        "seq": seq + 1,
                        "timestamp": utc_now_iso(),
                        "examiner": self.examiner,
                        "action": action,
                        "details": details or {},
                        "prev_hash": prev,
                    }
                    entry["entry_hash"] = _entry_hash(entry)
                    fh.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
                    fh.flush()
                    os.fsync(fh.fileno())
                finally:
                    _unlock(lk)
        finally:
            os.chmod(self.path, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
        return entry

    # -- vérification ----------------------------------------------------------
    def verify(self) -> VerificationResult:
        problems: list[str] = []
        prev, expected_seq, count = GENESIS_HASH, 1, 0
        try:
            for e in self.entries():
                count += 1
                seq = e.get("seq")
                if seq != expected_seq:
                    problems.append(f"seq {seq} : attendu {expected_seq} (ligne supprimée ou réordonnée ?)")
                if e.get("prev_hash") != prev:
                    problems.append(f"seq {seq} : prev_hash ne correspond pas à l'entrée précédente")
                if e.get("entry_hash") != _entry_hash(e):
                    problems.append(f"seq {seq} : entry_hash invalide (contenu modifié)")
                prev = e.get("entry_hash", "")
                expected_seq = (seq or expected_seq) + 1
        except AuditError as exc:
            problems.append(str(exc))
        return VerificationResult(ok=not problems, entries=count, head_hash=prev, problems=problems)
