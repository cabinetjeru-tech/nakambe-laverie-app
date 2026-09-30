/**
 * Mise en page des documents imprimés (impression, PDF, Word) : en-tête administratif, bandeau de titre,
 * cartouche d'identification, copie élève avec zone nom / note. Fonctions pures (testables).
 */

export type Entete = {
  /** Ligne administrative facultative (ministère, direction régionale…), saisie par l'enseignant. */
  administration?: string;
  etablissement?: string;
  ville?: string;
  anneeScolaire?: string;
  enseignant?: string;
  discipline?: string;
  classe?: string;
  duree?: string;
  theme?: string;
};

export type OptionsDocument = {
  /** Mention « Préparé avec l'assistance de PÉDAGOGUE.IA » (absente de la copie élève). */
  pied: boolean;
  /** Copie distribuée aux élèves : zone nom / classe / note, sans nom de l'enseignant ni mention de la plateforme. */
  copieEleve?: boolean;
  /** Intitulé du bandeau lorsqu'on exporte une partie (« Sujet », « Corrigé »…). */
  intitule?: string;
  entete?: Entete;
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** Année scolaire en cours (rentrée en septembre) : « 2026-2027 » à partir de septembre 2026. */
export function anneeScolaireCourante(d = new Date()): string {
  const a = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${a}-${a + 1}`;
}

export const PRINT_CSS = `
  @page { size: A4; margin: 15mm 15mm 16mm; @bottom-center { content: "Page " counter(page) " / " counter(pages); font: 8.5pt Arial, sans-serif; color: #666; } }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; margin: 0; }
  h1 { font-size: 14pt; margin: 12pt 0 6pt; color: #00592a; }
  h2 { font-size: 12pt; margin: 14pt 0 5pt; padding-bottom: 2pt; border-bottom: 1.5px solid #00592a; color: #00592a; text-transform: uppercase; letter-spacing: .3px; }
  h3 { font-size: 11.5pt; margin: 10pt 0 4pt; color: #111; }
  h4 { font-size: 11pt; margin: 8pt 0 3pt; }
  p { margin: 4pt 0; }
  ul, ol { margin: 3pt 0 3pt 16pt; padding: 0; }
  li { margin: 1.5pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #444; padding: 3.5pt 5pt; vertical-align: top; text-align: left; }
  th { background: #e8f1ec; font-weight: bold; }
  blockquote { border-left: 3px solid #00843d; margin: 6pt 0; padding: 3pt 8pt; background: #f4f8f5; }
  code { font-family: inherit; }
  hr { border: 0; border-top: 1px solid #bbb; margin: 8pt 0; }
  .badge { display: none; }
  .cite { font-size: 7.5pt; vertical-align: super; color: #555; }
  .entete { width: 100%; border: 0; margin: 0 0 8pt; }
  .entete td { border: 0; padding: 0; font-size: 9pt; line-height: 1.35; text-transform: uppercase; }
  .entete .droite { text-align: right; }
  .entete strong { font-size: 10pt; }
  .bandeau { border: 2px solid #00592a; text-align: center; padding: 6pt; margin: 4pt 0 8pt; }
  .bandeau .type { font-size: 14pt; font-weight: bold; letter-spacing: 1px; color: #00592a; text-transform: uppercase; }
  .bandeau .sujet { font-size: 11.5pt; font-weight: bold; margin-top: 2pt; }
  .cartouche td { font-size: 10pt; padding: 3pt 5pt; }
  .cartouche .lib { font-weight: bold; background: #f3f5f4; white-space: nowrap; width: 1%; }
  .eleve td { font-size: 10.5pt; padding: 7pt 6pt; }
  .pied { margin-top: 16pt; border-top: 1px solid #aaa; padding-top: 4pt; font-size: 8pt; color: #666; }
`;

/** Retire le premier titre de niveau 1 du corps pour le placer dans le bandeau (évite le doublon). */
export function extraireTitre(bodyHtml: string): { titre: string | null; corps: string } {
  const m = bodyHtml.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return { titre: null, corps: bodyHtml };
  const titre = m[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return { titre: titre || null, corps: bodyHtml.slice(m[0].length) };
}

/** « Fiche pédagogique — La digestion » → type « Fiche pédagogique », sujet « La digestion ». */
export function decouperTitre(titre: string): { type: string; sujet: string | null } {
  const [type, ...reste] = titre.split(/\s+[—–:-]\s+/);
  return { type: (type ?? titre).trim(), sujet: reste.join(" — ").trim() || null };
}

export function enteteHtml(e: Entete, copieEleve: boolean): string {
  const gauche = [
    e.administration ? `<strong>${escapeHtml(e.administration)}</strong>` : "",
    e.etablissement ? `<strong>${escapeHtml(e.etablissement)}</strong>` : "",
    e.ville ? escapeHtml(e.ville) : "",
  ].filter(Boolean);
  const droite = [`<strong>BURKINA FASO</strong>`, `Année scolaire ${escapeHtml(e.anneeScolaire || anneeScolaireCourante())}`];
  if (!copieEleve && e.enseignant) gauche.push(`Enseignant : ${escapeHtml(e.enseignant)}`);
  return `<table class="entete"><tr><td>${gauche.join("<br>")}</td><td class="droite">${droite.join("<br>")}</td></tr></table>`;
}

/** Le corps contient déjà un tableau d'identification (discipline, classe…) en tête : pas de second cartouche. */
export function aDejaIdentification(corps: string): boolean {
  const debut = corps.slice(0, 2500);
  const table = debut.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? "";
  return /discipline/i.test(table) && /classe/i.test(table);
}

function cartoucheHtml(e: Entete, copieEleve: boolean): string {
  const cell = (lib: string, val?: string) => `<td class="lib">${lib}</td><td>${val ? escapeHtml(val) : "&nbsp;"}</td>`;
  if (copieEleve) {
    return `<table class="cartouche eleve"><tr>${cell("Nom et prénom(s)")}<td class="lib">N°</td><td style="width:12%">&nbsp;</td></tr><tr>${cell("Classe", e.classe)}<td class="lib">Note</td><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/ 20</td></tr></table>
<table class="cartouche"><tr>${cell("Discipline", e.discipline)}${cell("Durée", e.duree)}</tr></table>`;
  }
  return `<table class="cartouche"><tr>${cell("Discipline", e.discipline)}${cell("Classe", e.classe)}${cell("Durée", e.duree)}</tr><tr>${cell("Thème", e.theme)}<td class="lib">Date</td><td colspan="3">…… / …… / ……………</td></tr></table>`;
}

export function buildDocumentHtml(title: string, bodyHtml: string, o: OptionsDocument): string {
  const e = o.entete ?? {};
  const { titre, corps } = extraireTitre(bodyHtml);
  const brut = titre ?? o.intitule ?? title;
  const { type, sujet } = decouperTitre(brut);
  const intitule = o.intitule && titre ? o.intitule : type;
  const sousTitre = o.intitule && titre ? brut : (sujet ?? e.theme ?? "");
  const bandeau = `<div class="bandeau"><div class="type">${escapeHtml(intitule)}</div>${sousTitre ? `<div class="sujet">${escapeHtml(sousTitre)}</div>` : ""}</div>`;
  const pied = o.pied
    ? `<div class="pied">Préparé avec l'assistance de PÉDAGOGUE.IA — L'intelligence au service de la pédagogie. Contenu vérifié et adapté par l'enseignant avant utilisation en classe.</div>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${enteteHtml(e, !!o.copieEleve)}${bandeau}${o.copieEleve || !aDejaIdentification(corps) ? cartoucheHtml(e, !!o.copieEleve) : ""}${corps}${pied}</body></html>`;
}
