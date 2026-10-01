"""Dossier d'affaire normalisé.

Structure créée par `veritrace case init` :

    <AFFAIRE>/
    ├── normalized/veritrace_case.json   ← format pivot (source unique des rapports)
    ├── acquisition/raw/<ACQ-ID>/        ← données brutes collectées (ne jamais modifier)
    ├── parsed/<outil>/                  ← sorties brutes d'ALEAPP, MVT, Autopsy…
    ├── custody/documents/               ← PV, consentement, mandat (hachés)
    ├── reports/                         ← rapports générés (PDF, Markdown)
    ├── assets/                          ← logo du cabinet, etc.
    ├── audit/audit.jsonl                ← journal d'audit chaîné (lecture seule)
    └── logs/veritrace.log               ← logs techniques
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from veritrace import __author__, __version__
from veritrace.core.audit import AuditLog
from veritrace.core.authorization import AuthorizationRecord
from veritrace.core.hashing import sha256_file
from veritrace.core.logging_setup import attach_case_logfile, get_logger
from veritrace.core.timeutil import utc_now_iso
from veritrace.schema.pivot import SCHEMA_VERSION
from veritrace.schema.validator import ensure_valid

log = get_logger("case")

LAYOUT = (
    "normalized",
    "acquisition/raw",
    "parsed",
    "custody/documents",
    "reports",
    "assets",
    "audit",
    "logs",
)
DATA_FILE = Path("normalized") / "veritrace_case.json"
AUDIT_FILE = Path("audit") / "audit.jsonl"


class CaseError(RuntimeError):
    pass


def empty_document(*, case_id: str, title: str, auth: AuthorizationRecord, organization: dict[str, Any],
                   report_type: str = "judiciaire", display_timezone: str = "UTC") -> dict[str, Any]:
    """Document pivot vide (appareil non encore identifié)."""
    now = utc_now_iso()
    return {
        "case": {
            "case_id": case_id,
            "title": title,
            "examiner": auth.examiner,
            "created_at": now,
            "authorization": {"type": auth.legal_basis, "reference": auth.reference,
                              "confirmed_by": auth.examiner, "confirmed_at": auth.confirmed_at},
            "x_veritrace": {"report_type": report_type, "display_timezone": display_timezone,
                            "organization": organization, "limitations": []},
        },
        "device": {"manufacturer": None, "model": None, "os_version": None, "imei": [], "serial": None},
        "acquisitions": [], "artifacts": [], "findings": [], "timeline": [], "chain_of_custody": [],
        "x_veritrace": {"schema_version": SCHEMA_VERSION, "tool_runs": [],
                        "integrity": {"generated_at": now,
                                      "generator": {"name": "Veritrace", "version": __version__, "author": __author__}}},
    }


class Case:
    def __init__(self, root: str | Path, auth: AuthorizationRecord) -> None:
        self.root = Path(root).resolve()
        self.auth = auth
        self.audit = AuditLog(self.root / AUDIT_FILE, examiner=auth.examiner)

    # -- cycle de vie -----------------------------------------------------------
    @classmethod
    def create(cls, root: str | Path, *, case_id: str, title: str, auth: AuthorizationRecord,
               organization: dict[str, Any], report_type: str = "judiciaire",
               display_timezone: str = "UTC") -> "Case":
        root = Path(root)
        if (root / DATA_FILE).exists():
            raise CaseError(f"Une affaire existe déjà dans {root.resolve()}")
        for d in LAYOUT:
            (root / d).mkdir(parents=True, exist_ok=True)
        case = cls(root, auth)
        attach_case_logfile(case.root / "logs")
        case.audit.append("authorization_confirmed", auth.as_dict())
        doc = empty_document(case_id=case_id, title=title, auth=auth, organization=organization,
                             report_type=report_type, display_timezone=display_timezone)
        case.save(doc, reason="case_created")
        log.info("Affaire %s créée dans %s", case_id, case.root)
        return case

    @classmethod
    def open(cls, root: str | Path, auth: AuthorizationRecord) -> "Case":
        case = cls(root, auth)
        if not case.data_path.exists():
            raise CaseError(f"Aucune affaire Veritrace dans {case.root} ({DATA_FILE} absent). "
                            "Utilisez `veritrace case init`.")
        attach_case_logfile(case.root / "logs")
        case.audit.append("case_opened", {"authorization": auth.as_dict()})
        return case

    # -- données ----------------------------------------------------------------
    @property
    def data_path(self) -> Path:
        return self.root / DATA_FILE

    def load(self) -> dict[str, Any]:
        with open(self.data_path, encoding="utf-8") as fh:
            return json.load(fh)

    def refresh_integrity(self, doc: dict[str, Any]) -> dict[str, Any]:
        """Met à jour `x_veritrace.integrity` (version, état et tête du journal d'audit)."""
        result = self.audit.verify()
        now = utc_now_iso()
        doc.setdefault("x_veritrace", {})["integrity"] = {
            "generated_at": now,
            "generator": {"name": "Veritrace", "version": __version__, "author": __author__},
            "audit": {"entries": result.entries, "head_hash": result.head_hash,
                      "verified": result.ok, "verified_at": now},
        }
        if not result.ok:
            log.error("Journal d'audit NON intègre : %s", "; ".join(result.problems))
        return doc

    def save(self, doc: dict[str, Any], *, reason: str) -> str:
        """Valide puis écrit atomiquement le JSON normalisé ; renvoie son SHA-256."""
        self.refresh_integrity(doc)
        ensure_valid(doc, case_root=None)
        self.data_path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.data_path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(doc, fh, ensure_ascii=False, indent=2)
                fh.write("\n")
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, self.data_path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
        digest = sha256_file(self.data_path)
        self.audit.append("case_data_saved", {"reason": reason, "file": str(DATA_FILE), "sha256": digest})
        return digest
