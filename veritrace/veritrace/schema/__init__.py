"""Contrat de données Veritrace : schéma JSON normalisé + validateur."""
from veritrace.schema.validator import (  # noqa: F401
    SCHEMA_PATH,
    CaseValidationError,
    Issue,
    ValidationReport,
    content_hash,
    ensure_valid,
    validate,
    validate_file,
)
