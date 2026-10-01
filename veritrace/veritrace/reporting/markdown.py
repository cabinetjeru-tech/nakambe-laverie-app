"""Rendu Markdown (GFM) d'un ReportModel."""
from __future__ import annotations

from veritrace.reporting.model import (Bullets, Figure, KeyValue, Label, PageBreak, Paragraph, ReportModel,
                                       Signature, Subheading, Table)


def _esc(text: str) -> str:
    """Échappe ce qui casserait un tableau GFM ; conserve le texte lisible."""
    return str(text).replace("\\", "\\\\").replace("|", "\\|").replace("\n", "<br>")


def _table(headers: list[str], rows: list[list[str]], mono: tuple[int, ...] = ()) -> list[str]:
    out = ["| " + " | ".join(_esc(h) for h in headers) + " |",
           "|" + "|".join("---" for _ in headers) + "|"]
    for r in rows:
        cells = [f"`{c}`" if i in mono and c not in ("", "—") else _esc(c) for i, c in enumerate(r)]
        out.append("| " + " | ".join(cells) + " |")
    return out


def render_markdown(model: ReportModel) -> str:
    c = model.cover
    lines: list[str] = []
    # --- page de garde
    if c.logo_path:
        lines += [f"![Logo {c.org_name}]({c.logo_path.as_posix()})", ""]
    else:
        lines += ["<!-- Emplacement logo : renseigner case.organization.logo_path -->", ""]
    lines += [f"**{c.org_name}**  "] + [f"{l}  " for l in c.org_lines] + [""]
    lines += [f"# {c.report_title}", "", f"## {c.case_title}", ""]
    lines += _table(["", ""], [[k, v] for k, v in c.meta], mono=())
    if c.devices:
        lines += ["", "**Appareil(s) examiné(s)**", ""] + _table(c.devices.headers, c.devices.rows)
    lines += ["", f"> {c.confidentiality}", "", "---", ""]

    # --- sections
    for s in model.sections:
        if s.new_page:
            lines += ['<div style="page-break-before: always"></div>', ""]
        lines += [f"## {s.title}", ""]
        for b in s.blocks:
            if isinstance(b, Subheading):
                lines += [f"### {b.text}", ""]
            elif isinstance(b, Label):
                lines += [f"**{b.text}**", ""]
            elif isinstance(b, Figure):
                lines += [f"![{_esc(b.caption)}]({b.path.as_posix()})", "", f"*{b.caption}*", ""]
            elif isinstance(b, PageBreak):
                lines += ['<div style="page-break-after: always"></div>', ""]
            elif isinstance(b, Paragraph):
                if b.style == "warning":
                    lines += [f"> **⚠ {b.text}**", ""]
                elif b.style == "note":
                    lines += [f"> {b.text}", ""]
                elif b.style == "interpretation":
                    lines += ["> *" + b.text + "*", ""]
                elif b.style == "small":
                    lines += [f"*{b.text}*", ""]
                else:
                    lines += [b.text, ""]
            elif isinstance(b, Bullets):
                lines += [f"- {i}" for i in b.items] + [""]
            elif isinstance(b, KeyValue):
                lines += _table(["Élément", "Valeur"], [[k, v] for k, v in b.rows]) + [""]
            elif isinstance(b, Table):
                if b.rows:
                    lines += _table(b.headers, b.rows, b.mono_cols) + [""]
                else:
                    lines += ["*Aucun élément.*", ""]
            elif isinstance(b, Signature):
                lines += [f"{l}  " for l in b.lines] + [""]

    lines += ["---", "", f"*{model.footer}*", ""]
    return "\n".join(lines)
