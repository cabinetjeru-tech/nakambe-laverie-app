"use client";

/** Impression et export Word (HTML ouvert par Word) d'une production. */

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
    ? `<div class="pied">Préparé avec l'assistance de KIBARU FASO — L'intelligence pédagogique au service de l'enseignant. Contenu à vérifier et adapter par l'enseignant avant utilisation en classe.</div>`
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
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "kibaru-faso"}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
