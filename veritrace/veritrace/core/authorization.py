"""Garde-fou d'autorisation légale, bloquant, exécuté au démarrage de chaque commande.

Aucune commande (hors --help / --version) ne s'exécute tant que l'examinateur n'a pas :
  1. déclaré son identité ;
  2. indiqué la base légale (consentement écrit, mandat, réquisition, ordonnance, ...) ;
  3. indiqué la référence du document d'autorisation ;
  4. recopié exactement la phrase de confirmation.

Il n'existe volontairement aucun drapeau de contournement : la confirmation se fait
toujours par saisie. En usage scripté, l'entrée doit être fournie explicitement sur stdin,
ce qui laisse une trace consciente de l'engagement de l'examinateur.

La déclaration est consignée dans le journal d'audit (global et, le cas échéant, de l'affaire).

Rappel de périmètre : Veritrace n'inclut et n'inclura aucune fonction de contournement
d'écran de verrouillage, de mot de passe ou d'authentification. L'acquisition suppose un
appareil déverrouillé par son titulaire avec le débogage USB activé.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import click

from veritrace.core.timeutil import utc_now_iso

CONFIRMATION_PHRASE = "AUTORISATION VERIFIEE"

#: Valeurs de `case.authorization.type` du format pivot.
LEGAL_BASES = {
    "consentement": "Consentement écrit du titulaire de l'appareil",
    "mandat": "Mandat / commission rogatoire",
    "ordre_judiciaire": "Ordre judiciaire (réquisition, ordonnance)",
    "politique-entreprise": "Politique interne de l'entreprise (appareil professionnel)",
}

_WARNING = """\
┌──────────────────────────────────────────────────────────────────────┐
│  AVERTISSEMENT — USAGE STRICTEMENT ENCADRÉ                           │
│  Veritrace ne doit être utilisé que dans le cadre d'un examen        │
│  légalement autorisé (consentement écrit du titulaire ou mandat).    │
│  Toute utilisation sans autorisation peut constituer une infraction. │
│  Vos actions sont consignées dans un journal d'audit chaîné.         │
└──────────────────────────────────────────────────────────────────────┘"""


class AuthorizationRefused(click.ClickException):
    exit_code = 3

    def __init__(self, message: str = "Autorisation légale non confirmée — aucune action exécutée.") -> None:
        super().__init__(message)


@dataclass(frozen=True)
class AuthorizationRecord:
    examiner: str
    legal_basis: str
    reference: str
    confirmed_at: str

    def as_dict(self) -> dict:
        return asdict(self)


def require_authorization() -> AuthorizationRecord:
    """Invite bloquante. Lève AuthorizationRefused si la confirmation échoue."""
    click.secho(_WARNING, fg="yellow", err=True)
    try:
        examiner = click.prompt("Nom de l'examinateur", err=True).strip()
        basis = click.prompt(
            "Base légale",
            type=click.Choice(sorted(LEGAL_BASES)),
            err=True,
        )
        reference = click.prompt(
            "Référence du document d'autorisation (n° de mandat, PV de consentement…)", err=True
        ).strip()
        phrase = click.prompt(
            f'Tapez exactement « {CONFIRMATION_PHRASE} » pour confirmer', err=True
        ).strip()
    except (click.Abort, EOFError) as exc:
        raise AuthorizationRefused() from exc

    if not examiner or not reference:
        raise AuthorizationRefused("Examinateur et référence d'autorisation obligatoires.")
    if phrase != CONFIRMATION_PHRASE:
        raise AuthorizationRefused("Phrase de confirmation incorrecte — aucune action exécutée.")

    record = AuthorizationRecord(
        examiner=examiner, legal_basis=basis, reference=reference, confirmed_at=utc_now_iso()
    )
    click.secho(f"✔ Autorisation confirmée par {examiner} ({LEGAL_BASES[basis]}, réf. {reference}).",
                fg="green", err=True)
    return record
