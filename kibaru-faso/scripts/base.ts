/**
 * Outil d'administration de la base documentaire KIBARU FASO.
 *
 *   npm run base:verifier    contrôle la base (métadonnées, ID uniques, remplacements, emplacements)
 *   npm run base:catalogue   régénère base-documentaire/CATALOGUE.md (ressources, fiches en attente, historique)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { BASE_DIR, loadBase } from "../src/lib/base/load";
import { CATEGORIES, categoryLabel, STATUT_LABELS, STATUTS } from "../src/lib/base/structure";
import { resolveBase, type RefDocument } from "../src/lib/search";

const root = path.join(process.cwd(), BASE_DIR);
const cmd = process.argv[2];

const cell = (s: string | number | undefined | null) => String(s ?? "—").replace(/\|/g, "/").replace(/\n/g, " ");

async function main() {
  const base = await loadBase(root);
  const { usable, history } = resolveBase(base.docs);

  if (cmd === "verifier") {
    const errors = base.issues.filter((i) => i.level === "erreur");
    const warnings = base.issues.filter((i) => i.level === "avertissement");
    console.log(`Base documentaire KIBARU FASO — ${base.docs.length} ressource(s) lue(s), ${usable.length} consultable(s), ${history.length} dans l'historique, ${base.pending.length} fiche(s) en attente.`);
    for (const i of [...errors, ...warnings]) console.log(`${i.level === "erreur" ? "ERREUR" : "attention"}  ${i.path} : ${i.message}`);
    console.log(errors.length ? `\n${errors.length} erreur(s) à corriger.` : "\nAucune erreur bloquante.");
    process.exitCode = errors.length ? 1 : 0;
    return;
  }

  if (cmd === "catalogue") {
    const row = (d: RefDocument, extra = "") =>
      `| ${cell(d.documentId)} | ${cell(d.title)} | ${cell(STATUT_LABELS[d.statut ?? "A_VERIFIER"])} | ${cell(d.priority)} | ${cell(d.classes.join(", ") || "toutes")} | ${cell(d.disciplines.join(", ") || "toutes")} | ${cell(d.year)} | ${cell(d.version)} | ${cell(d.verifiedAt)} | \`${cell(d.path)}\` |${extra}`;
    const head = "| ID | Titre | Statut | Priorité | Classe | Matière | Année | Version | Vérifié le | Emplacement |\n|---|---|---|---|---|---|---|---|---|---|";
    const lines: string[] = [
      "# Catalogue de la base documentaire KIBARU FASO",
      "",
      "> Fichier généré par `npm run base:catalogue` — ne pas modifier à la main.",
      "",
      "## Synthèse",
      "",
      `- Ressources consultables : **${usable.length}**`,
      `- Historique (versions remplacées, archivées, expirées) : **${history.length}**`,
      `- Fiches en attente d'intégration (document non encore déposé) : **${base.pending.length}**`,
      `- Par statut : ${STATUTS.map((s) => `${STATUT_LABELS[s]} ${base.docs.filter((d) => d.statut === s).length}`).join(" · ")}`,
      "",
      "## Ressources consultables",
      "",
    ];
    for (const c of CATEGORIES.filter((c) => c.code !== "09_ARCHIVES")) {
      const docs = usable.filter((d) => d.category === c.code);
      if (!docs.length) continue;
      lines.push(`### ${c.code} — ${c.label}`, "", head, ...docs.map((d) => row(d)), "");
      for (const d of docs.filter((d) => d.note)) lines.push(`- ${d.documentId ?? d.title} : ${d.note}`);
      if (docs.some((d) => d.note)) lines.push("");
    }
    const outside = usable.filter((d) => !d.category);
    if (outside.length) lines.push("### Hors structure (à ranger)", "", head, ...outside.map((d) => row(d)), "");
    if (!usable.length) lines.push("_Aucune ressource consultable pour le moment._", "");
    lines.push("## Fiches en attente d'intégration", "");
    if (base.pending.length) {
      lines.push("| ID | Titre | Statut prévu | Catégorie | Fiche |", "|---|---|---|---|---|");
      for (const p of base.pending) lines.push(`| ${cell(p.documentId)} | ${cell(p.title)} | ${STATUT_LABELS[p.statut]} | ${cell(categoryLabel(p.category))} | \`${cell(p.path)}\` |`);
    } else lines.push("_Aucune._");
    lines.push("", "## Historique des versions", "", "Ces ressources sont conservées mais ne sont jamais consultées pour répondre.", "");
    if (history.length) {
      lines.push("| ID | Titre | Version | Année | Raison | Emplacement |", "|---|---|---|---|---|---|");
      for (const h of history) lines.push(`| ${cell(h.doc.documentId)} | ${cell(h.doc.title)} | ${cell(h.doc.version)} | ${cell(h.doc.year)} | ${cell(h.reason)} | \`${cell(h.doc.path)}\` |`);
    } else lines.push("_Aucune version remplacée ou archivée pour le moment._");
    const links = base.docs.flatMap((d) => (d.supersedes ?? []).map((old) => `- ${old} → ${d.documentId ?? d.title} (${STATUT_LABELS[d.statut ?? "A_VERIFIER"]})`));
    if (links.length) lines.push("", "### Filiations déclarées (ancienne → nouvelle)", "", ...links);
    lines.push("", "## Contrôles", "");
    if (base.issues.length) for (const i of base.issues) lines.push(`- ${i.level === "erreur" ? "**Erreur**" : "Attention"} — \`${i.path}\` : ${i.message}`);
    else lines.push("_Aucune anomalie._");
    await fs.writeFile(path.join(root, "CATALOGUE.md"), lines.join("\n") + "\n");
    console.log(`Catalogue écrit : ${BASE_DIR}/CATALOGUE.md (${usable.length} consultable(s), ${history.length} en historique, ${base.pending.length} en attente).`);
    return;
  }

  console.log("Usage : npm run base:verifier | npm run base:catalogue");
  process.exitCode = 2;
}

void main();
