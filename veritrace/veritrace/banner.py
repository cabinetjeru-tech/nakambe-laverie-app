"""Bannière affichée au lancement de la CLI."""
from __future__ import annotations

import click

from veritrace import CREDIT_LINE, __version__

_ART = r"""
 __     __        _ _
 \ \   / /__ _ __(_) |_ _ __ __ _  ___ ___
  \ \ / / _ \ '__| | __| '__/ _` |/ __/ _ \
   \ V /  __/ |  | | |_| | | (_| | (_|  __/
    \_/ \___|_|  |_|\__|_|  \__,_|\___\___|
"""


def banner_text() -> str:
    return (
        f"{_ART}\n"
        f"  Forensique Android — examens autorisés uniquement   v{__version__}\n"
        f"  {CREDIT_LINE}\n"
    )


def print_banner() -> None:
    # La bannière part sur stderr pour ne pas polluer une sortie redirigée (JSON, etc.).
    click.secho(banner_text(), fg="cyan", err=True)
