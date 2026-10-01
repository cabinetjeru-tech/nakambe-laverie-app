"""Rendu PDF (ReportLab) d'un ReportModel.

- Page de garde : emplacement logo (ou cadre « Emplacement logo ») + coordonnées du cabinet.
- Pied de page sur chaque page : « Veritrace — développé par Nourou Chafikou », référence
  de l'affaire, numéro de page.
- Polices : DejaVu Sans si présente (meilleure couverture Unicode : accents, arabe latinisé…),
  sinon Bitstream Vera livrée avec ReportLab. Forçable via VERITRACE_PDF_FONT=/chemin/police.ttf.
"""
from __future__ import annotations

import os
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

from veritrace.core.logging_setup import get_logger
from veritrace.reporting import model as m

log = get_logger("reporting.pdf")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

ACCENT = colors.HexColor("#1F3A5F")
LIGHT = colors.HexColor("#EEF2F7")
GRID = colors.HexColor("#B8C2CF")
WARN = colors.HexColor("#9A3412")

_FONT_CANDIDATES = {
    "regular": ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf",
                "/Library/Fonts/DejaVuSans.ttf", "C:/Windows/Fonts/DejaVuSans.ttf"],
    "bold": ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
             "/Library/Fonts/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/DejaVuSans-Bold.ttf"],
    "mono": ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
             "/Library/Fonts/DejaVuSansMono.ttf", "C:/Windows/Fonts/DejaVuSansMono.ttf"],
}
_fonts: dict[str, str] | None = None


def _register_fonts() -> dict[str, str]:
    """Enregistre les polices une seule fois ; renvoie {regular, bold, mono}."""
    global _fonts
    if _fonts:
        return _fonts
    import reportlab

    rl_fonts = Path(reportlab.__file__).parent / "fonts"
    fallback = {"regular": rl_fonts / "Vera.ttf", "bold": rl_fonts / "VeraBd.ttf", "mono": None}
    override = os.environ.get("VERITRACE_PDF_FONT")
    names: dict[str, str] = {}
    for kind, cands in _FONT_CANDIDATES.items():
        paths = ([override] if override and kind != "mono" else []) + cands
        path = next((p for p in paths if p and os.path.isfile(p)), None) or fallback[kind]
        if path is None:
            names[kind] = "Courier"
            continue
        name = f"VT-{kind}"
        try:
            pdfmetrics.registerFont(TTFont(name, str(path)))
            names[kind] = name
        except Exception as exc:  # police corrompue : on ne bloque pas le rapport
            log.warning("Police %s inutilisable (%s) — repli Helvetica", path, exc)
            names[kind] = {"regular": "Helvetica", "bold": "Helvetica-Bold", "mono": "Courier"}[kind]
    _fonts = names
    return names


def _styles(f: dict[str, str]) -> dict[str, ParagraphStyle]:
    base = ParagraphStyle("base", fontName=f["regular"], fontSize=9.5, leading=13)
    return {
        "body": base,
        "small": ParagraphStyle("small", parent=base, fontSize=8, leading=10.5, textColor=colors.HexColor("#4B5563")),
        "note": ParagraphStyle("note", parent=base, backColor=LIGHT, borderPadding=5, leftIndent=4, rightIndent=4,
                               spaceBefore=8, spaceAfter=8),
        "interpretation": ParagraphStyle("interp", parent=base, fontName=f["regular"], backColor=colors.HexColor("#FFF7E6"),
                                         borderColor=colors.HexColor("#E0B060"), borderWidth=0.5, borderPadding=5,
                                         leftIndent=4, rightIndent=4, spaceBefore=8, spaceAfter=8),
        "label": ParagraphStyle("label", parent=base, fontName=f["bold"], fontSize=8.5, leading=11,
                                textColor=colors.HexColor("#374151"), spaceBefore=6, spaceAfter=2),
        "caption": ParagraphStyle("caption", parent=base, fontSize=7, leading=9, alignment=TA_CENTER,
                                  textColor=colors.HexColor("#4B5563"), spaceAfter=6),
        "warning": ParagraphStyle("warning", parent=base, fontName=f["bold"], textColor=WARN, spaceBefore=4),
        "h1": ParagraphStyle("h1", parent=base, fontName=f["bold"], fontSize=14, leading=18, textColor=ACCENT,
                             spaceBefore=10, spaceAfter=6),
        "h2": ParagraphStyle("h2", parent=base, fontName=f["bold"], fontSize=10.5, leading=14, textColor=ACCENT,
                             spaceBefore=8, spaceAfter=4),
        "cell": ParagraphStyle("cell", parent=base, fontSize=7.5, leading=9.5),
        "cellh": ParagraphStyle("cellh", parent=base, fontName=f["bold"], fontSize=7.5, leading=9.5,
                                textColor=colors.white),
        "mono": ParagraphStyle("mono", parent=base, fontName=f["mono"], fontSize=6.3, leading=8.5),
        "cover_title": ParagraphStyle("ct", parent=base, fontName=f["bold"], fontSize=18, leading=23,
                                      textColor=ACCENT, alignment=TA_CENTER),
        "cover_sub": ParagraphStyle("cs", parent=base, fontSize=13, leading=17, alignment=TA_CENTER),
        "org": ParagraphStyle("org", parent=base, fontSize=8.5, leading=11, alignment=TA_RIGHT),
        "org_name": ParagraphStyle("orgn", parent=base, fontName=f["bold"], fontSize=11, leading=14,
                                   alignment=TA_RIGHT),
    }


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)


def _mono(text: str, style: ParagraphStyle) -> Paragraph:
    # Les empreintes (64 caractères sans espace) sont coupées par ReportLab
    # (splitLongWords) quand la colonne est trop étroite.
    return Paragraph(escape(str(text)), style)


def _table(headers: list[str], rows: list[list[str]], widths: list[float] | None, mono: tuple[int, ...],
           st: dict[str, ParagraphStyle], header_row: bool = True) -> Table:
    n = len(headers)
    ratios = widths or [1] * n
    col_w = [CONTENT_W * r / sum(ratios) for r in ratios]
    data = []
    if header_row:
        data.append([_p(h, st["cellh"]) for h in headers])
    for r in rows:
        data.append([_mono(c, st["mono"]) if i in mono else _p(c, st["cell"]) for i, c in enumerate(r)])
    t = Table(data, colWidths=col_w, repeatRows=1 if header_row else 0)
    style = [("GRID", (0, 0), (-1, -1), 0.4, GRID), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
             ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]
    if header_row:
        style += [("BACKGROUND", (0, 0), (-1, 0), ACCENT)]
        style += [("BACKGROUND", (0, i), (-1, i), LIGHT) for i in range(2, len(data), 2)]
    t.setStyle(TableStyle(style))
    return t


def _kv(rows: list[tuple[str, str]], st: dict[str, ParagraphStyle]) -> Table:
    data = [[_p(k, st["cell"]), _mono(v, st["mono"]) if len(v) == 64 and " " not in v else _p(v, st["cell"])]
            for k, v in rows]
    t = Table(data, colWidths=[CONTENT_W * 0.3, CONTENT_W * 0.7])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, GRID), ("BACKGROUND", (0, 0), (0, -1), LIGHT),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    return t


def _logo_box(cover: m.Cover, st: dict[str, ParagraphStyle]):
    box_w, box_h = 45 * mm, 25 * mm
    if cover.logo_path:
        try:
            img = Image(str(cover.logo_path))
            ratio = min(box_w / img.imageWidth, box_h / img.imageHeight)
            img.drawWidth, img.drawHeight = img.imageWidth * ratio, img.imageHeight * ratio
            return img
        except Exception as exc:
            log.warning("Logo illisible (%s) : %s — emplacement vide utilisé", cover.logo_path, exc)
    ph = Table([[_p("Emplacement logo", st["small"])]], colWidths=[box_w], rowHeights=[box_h])
    ph.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, GRID), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return ph


def _cover_flow(cover: m.Cover, st: dict[str, ParagraphStyle]) -> list:
    org = [_p(cover.org_name, st["org_name"])] + [_p(l, st["org"]) for l in cover.org_lines]
    head = Table([[_logo_box(cover, st), org]], colWidths=[CONTENT_W * 0.4, CONTENT_W * 0.6])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("LINEBELOW", (0, 0), (-1, 0), 1.2, ACCENT),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return [head, Spacer(1, 45 * mm), _p(cover.report_title, st["cover_title"]), Spacer(1, 6 * mm),
            _p(cover.case_title, st["cover_sub"]), Spacer(1, 14 * mm), _kv(cover.meta, st)] + (
        [Spacer(1, 6 * mm), _p("Appareil(s) examiné(s)", st["h2"]),
         _table(cover.devices.headers, cover.devices.rows, cover.devices.widths, (), st)] if cover.devices else []
    ) + [Spacer(1, 10 * mm), _p(cover.confidentiality, st["note"]), PageBreak()]


def _figure(fig: m.Figure, st: dict[str, ParagraphStyle]) -> list:
    """Capture d'écran réduite (hauteur max 90 mm) + légende avec empreinte."""
    try:
        img = Image(str(fig.path))
        ratio = min((CONTENT_W * 0.6) / img.imageWidth, (90 * mm) / img.imageHeight, 1.0)
        img.drawWidth, img.drawHeight = img.imageWidth * ratio, img.imageHeight * ratio
        return [KeepTogether([img, _p(fig.caption, st["caption"])])]
    except Exception as exc:
        log.warning("Capture illisible (%s) : %s — référence textuelle seulement", fig.path, exc)
        return [_p(f"[Capture non affichable] {fig.caption}", st["caption"])]


def render_pdf(model: m.ReportModel, out_path: str | Path) -> Path:
    fonts = _register_fonts()
    st = _styles(fonts)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    def _footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setStrokeColor(GRID)
        canvas.line(MARGIN, 13 * mm, PAGE_W - MARGIN, 13 * mm)
        canvas.setFont(fonts["regular"], 7.5)
        canvas.setFillColor(colors.HexColor("#4B5563"))
        canvas.drawString(MARGIN, 9 * mm, model.footer)
        canvas.drawCentredString(PAGE_W / 2, 9 * mm, model.cover.case_id)
        canvas.drawRightString(PAGE_W - MARGIN, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    flow: list = _cover_flow(model.cover, st)
    for s in model.sections:
        if s.new_page:
            flow.append(PageBreak())
        section_flow: list = [_p(s.title, st["h1"])]
        for b in s.blocks:
            if isinstance(b, m.Subheading):
                section_flow.append(_p(b.text, st["h2"]))
            elif isinstance(b, m.Label):
                section_flow.append(_p(b.text, st["label"]))
            elif isinstance(b, m.PageBreak):
                section_flow.append(PageBreak())
            elif isinstance(b, m.Figure):
                section_flow += _figure(b, st)
            elif isinstance(b, m.Paragraph):
                section_flow.append(_p(b.text, st.get(b.style, st["body"])))
                section_flow.append(Spacer(1, 2))
            elif isinstance(b, m.Bullets):
                section_flow += [_p(f"•  {i}", st["body"]) for i in b.items]
                section_flow.append(Spacer(1, 4))
            elif isinstance(b, m.KeyValue):
                section_flow += [_kv(b.rows, st), Spacer(1, 6)]
            elif isinstance(b, m.Table):
                if b.rows:
                    section_flow += [_table(b.headers, b.rows, b.widths, b.mono_cols, st), Spacer(1, 6)]
                else:
                    section_flow.append(_p("Aucun élément.", st["small"]))
            elif isinstance(b, m.Signature):
                section_flow.append(Spacer(1, 8))
                section_flow.append(KeepTogether([_p(l, st["body"]) for l in b.lines] + [Spacer(1, 25 * mm)]))
        # Garde le titre de section avec son premier bloc.
        flow.append(KeepTogether(section_flow[:2]))
        flow += section_flow[2:]

    doc = SimpleDocTemplate(str(out_path), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                            topMargin=MARGIN, bottomMargin=20 * mm,
                            title=f"{model.cover.report_title} — {model.cover.case_id}",
                            author=model.footer, subject=model.cover.case_title, creator=model.footer)
    doc.build(flow, onFirstPage=_footer, onLaterPages=_footer)
    return out_path
