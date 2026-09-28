"use client";

/** Impression, téléchargement PDF et export Word (HTML ouvert par Word) d'une production. */

const PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Times New Roman", Georgia, serif; font-size: 12pt; line-height: 1.45; color: #111; }
  h1 { font-size: 17pt; margin: 0 0 8pt; }
  h2 { font-size: 14.5pt; margin: 16pt 0 6pt; }
  h3 { font-size: 13pt; margin: 12pt 0 4pt; }
  h4 { font-size: 12pt; margin: 10pt 0 4pt; }
  p { margin: 5pt 0; }
  ul, ol { margin: 4pt 0 4pt 18pt; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #555; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  th { background: #eee; }
  blockquote { border-left: 3px solid #999; margin: 6pt 0; padding: 2pt 8pt; color: #333; }
  code { font-family: inherit; }
  .badge { font-weight: bold; font-size: 9.5pt; border: 1px solid #777; border-radius: 3px; padding: 0 3pt; }
  .cite { font-size: 8.5pt; vertical-align: super; }
  .pied { margin-top: 20pt; border-top: 1px solid #aaa; padding-top: 5pt; font-size: 9pt; color: #555; }
`;

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

export function buildDocumentHtml(title: string, bodyHtml: string, withFooter: boolean): string {
  const footer = withFooter
    ? `<div class="pied">Préparé avec l'assistance de PÉDAGOGUE.IA — L'intelligence au service de la pédagogie. Contenu à vérifier et adapter par l'enseignant avant utilisation en classe.</div>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}${footer}</body></html>`;
}

export function printHtml(title: string, bodyHtml: string, withFooter = true) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Autorisez l'ouverture des fenêtres pour imprimer.");
    return;
  }
  w.document.open();
  w.document.write(buildDocumentHtml(title, bodyHtml, withFooter));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export function downloadWord(title: string, bodyHtml: string, withFooter = true) {
  const html = buildDocumentHtml(title, bodyHtml, withFooter);
  telecharger(new Blob(["﻿", html], { type: "application/msword" }), fileName(title, "doc"));
}

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Nom de fichier sans accents ni caractères spéciaux : certains navigateurs refusent les autres (« download » à la place). */
export function fileName(title: string, ext: string) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^A-Za-z0-9 ._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "pedagogue-ia"}.${ext}`;
}

/**
 * Téléchargement direct en PDF (A4), sans passer par la boîte d'impression : pratique sur téléphone.
 * Le document est rendu dans une page isolée (iframe) qui ne contient que la mise en forme d'impression,
 * puis découpé en pages A4 en évitant de couper une ligne de texte.
 */
export async function downloadPdf(title: string, bodyHtml: string, withFooter = true) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // Largeur utile A4 (210 mm − 2 × 14 mm de marge) à 96 ppp.
  const largeurPx = Math.round((182 / 25.4) * 96);
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${largeurPx}px;height:1200px;border:0;`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(buildDocumentHtml(title, bodyHtml, withFooter).replace("</style>", " body{margin:0;padding:0 0 16px;background:#fff;} </style>"));
    doc.close();
    await new Promise((r) => setTimeout(r, 50));
    const body = doc.body;
    iframe.style.height = `${body.scrollHeight + 20}px`;
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: "#ffffff", windowWidth: largeurPx, logging: false });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const marge = 14;
    const largeurMm = 210 - 2 * marge;
    const hauteurMm = 297 - 2 * marge;
    const pxParMm = canvas.width / largeurMm;
    const hauteurPagePx = Math.floor(hauteurMm * pxParMm);
    const ctx = canvas.getContext("2d")!;
    let y = 0;
    let page = 0;
    while (y < canvas.height) {
      let fin = Math.min(y + hauteurPagePx, canvas.height);
      if (fin < canvas.height) fin = coupeBlanche(ctx, canvas.width, y, fin);
      const tranche = document.createElement("canvas");
      tranche.width = canvas.width;
      tranche.height = fin - y;
      tranche.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, fin - y, 0, 0, canvas.width, fin - y);
      if (page > 0) pdf.addPage();
      pdf.addImage(tranche.toDataURL("image/jpeg", 0.92), "JPEG", marge, marge, largeurMm, (fin - y) / pxParMm);
      y = fin;
      page++;
    }
    telecharger(pdf.output("blob"), fileName(title, "pdf"));
  } finally {
    iframe.remove();
  }
}

/** Remonte la coupure de page jusqu'à une ligne entièrement blanche (au plus ~15 % de la page) pour ne pas couper le texte. */
function coupeBlanche(ctx: CanvasRenderingContext2D, largeur: number, debut: number, fin: number): number {
  const limite = Math.max(debut + 1, fin - Math.floor((fin - debut) * 0.15));
  const bloc = ctx.getImageData(0, limite, largeur, fin - limite).data;
  for (let ligne = fin - limite - 1; ligne >= 0; ligne--) {
    let blanche = true;
    for (let x = 0; x < largeur; x += 3) {
      const i = (ligne * largeur + x) * 4;
      if (bloc[i]! < 245 || bloc[i + 1]! < 245 || bloc[i + 2]! < 245) {
        blanche = false;
        break;
      }
    }
    if (blanche) return limite + ligne + 1;
  }
  return fin;
}
