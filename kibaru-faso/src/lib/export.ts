"use client";

import { buildDocumentHtml, type OptionsDocument } from "./document-imprime";

/** Impression, téléchargement PDF et export Word (HTML ouvert par Word) d'une production. */

export type { Entete, OptionsDocument } from "./document-imprime";

export function printHtml(title: string, bodyHtml: string, o: OptionsDocument) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Autorisez l'ouverture des fenêtres pour imprimer.");
    return;
  }
  w.document.open();
  w.document.write(buildDocumentHtml(title, bodyHtml, o));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export function downloadWord(title: string, bodyHtml: string, o: OptionsDocument) {
  // Word ne lit pas les marges CSS classiques : format A4 et marges via une section Word.
  const html = buildDocumentHtml(title, bodyHtml, o)
    .replace("<style>", "<style>@page WordSection1 { size: 21cm 29.7cm; margin: 1.5cm; } div.WordSection1 { page: WordSection1; } ")
    .replace("<body>", '<body><div class="WordSection1">')
    .replace("</body>", "</div></body>");
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
export async function downloadPdf(title: string, bodyHtml: string, o: OptionsDocument) {
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
    doc.write(buildDocumentHtml(title, bodyHtml, o).replace("</style>", " body{margin:0;padding:0 0 16px;background:#fff;} </style>"));
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
    // Rappel discipline / classe en haut de chaque page (sauf la première) et numéro de page en bas.
    const rappel = [o.entete?.discipline, o.entete?.classe].filter(Boolean).join(" — ");
    const total = pdf.getNumberOfPages();
    for (let n = 1; n <= total; n++) {
      pdf.setPage(n);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(110);
      if (n > 1 && rappel) pdf.text(rappel, marge, 9);
      if (total > 1) pdf.text(`Page ${n} / ${total}`, 105, 290, { align: "center" });
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
