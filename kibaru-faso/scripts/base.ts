/**
 * Outil d'administration de la base documentaire PÉDAGOGUE.IA.
 *
 *   npm run base:verifier    contrôle le registre maître et la base (métadonnées, ID, remplacements, emplacements)
 *   npm run base:nouvel-id -- 6e Mathématiques   propose le prochain ID libre (BF-6E-MATH-002…)
 *   npm run base:catalogue   régénère base-documentaire/CATALOGUE.md : tableau maître, couverture par classe,
 *                            ressources consultables, historique des versions, contrôles
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { BASE_DIR, loadBase, type PendingDoc } from "../src/lib/base/load";
import { REGISTRY_FILE } from "../src/lib/base/registry";
import { CATEGORIES, CLASS_INFO, STATUT_LABELS, STATUTS, subjectCodes, SUBJECTS, typeLabel, type Statut } from "../src/lib/base/structure";
import { canonicalClasse, resolveBase, type DocInfo } from "../src/lib/search";

const root = path.join(process.cwd(), BASE_DIR);
const cmd = process.argv[2];

const cell = (s: string | number | undefined | null) => (s === undefined || s === null || s === "" ? "—" : String(s).replace(/\|/g, "/").replace(/\n/g, " "));
const orVerify = (s: string | undefined) => s || "À vérifier";

/** Une ligne du tableau maître, que la ressource soit intégrée ou non. */
type MasterRow = {
  id?: string;
  classes: string[];
  matieres: string[];
  type?: string;
  titre: string;
  annee?: string;
  version?: string;
  statut?: Statut;
  source?: string;
  priorite?: string;
  integration: string;
};

/** Colonnes de couverture (section 12). */
const COVERAGE: [string, string[]][] = [
  ["Programmes / curricula", ["PROGRAMME", "CURRICULUM"]],
  ["Guides", ["GUIDE_PEDAGOGIQUE"]],
  ["Manuels", ["MANUEL", "FICHE_PEDAGOGIQUE"]],
  ["Référentiels", ["REFERENTIEL"]],
  ["Progressions", ["PROGRESSION"]],
  ["Évaluations / examens", ["EVALUATION", "EXAMEN"]],
  ["Textes officiels", ["TEXTE_OFFICIEL", "NOTE_DE_SERVICE", "CIRCULAIRE"]],
];

async function main() {
  const base = await loadBase(root);
  const { usable, history } = resolveBase(base.docs);
  const errors = base.issues.filter((i) => i.level === "erreur");
  const warnings = base.issues.filter((i) => i.level === "avertissement");
  const summary = `${base.registry.length} ressource(s) au registre maître ; ${base.docs.length} intégrée(s) dont ${usable.length} consultable(s) et ${history.length} dans l'historique ; ${base.pending.length} NON ENCORE INTÉGRÉE(S).`;

  if (cmd === "verifier") {
    console.log(`Base documentaire PÉDAGOGUE.IA — ${summary}`);
    for (const i of [...errors, ...warnings]) console.log(`${i.level === "erreur" ? "ERREUR   " : "attention"}  ${i.path} : ${i.message}`);
    console.log(errors.length ? `\n${errors.length} erreur(s) à corriger.` : `\nAucune erreur bloquante${warnings.length ? ` (${warnings.length} point(s) d'attention)` : ""}.`);
    process.exitCode = errors.length ? 1 : 0;
    return;
  }

  if (cmd === "catalogue") {
    const integrated: MasterRow[] = [...usable, ...history.map((h) => h.doc)].map((d: DocInfo) => ({
      id: d.documentId,
      classes: d.classes,
      matieres: d.disciplines,
      type: d.type,
      titre: d.title,
      annee: d.year,
      version: d.version,
      statut: d.statut,
      source: d.source ?? d.organisme,
      priorite: d.priority,
      integration: history.some((h) => h.doc.id === d.id) ? "Intégré — historique" : "Intégré",
    }));
    const notIntegrated: MasterRow[] = base.pending.map((p: PendingDoc) => ({
      id: p.documentId,
      classes: p.classes,
      matieres: p.disciplines,
      type: p.type,
      titre: p.title,
      annee: p.annee,
      version: p.version,
      statut: p.statut,
      source: p.source ?? p.organisme,
      priorite: p.priorite,
      integration: "NON ENCORE INTÉGRÉ",
    }));
    const master = [...integrated, ...notIntegrated].sort((a, b) => (a.id ?? "~").localeCompare(b.id ?? "~"));

    const L: string[] = [
      "# Catalogue de la base documentaire PÉDAGOGUE.IA",
      "",
      `> Fichier généré par \`npm run base:catalogue\` à partir de \`${REGISTRY_FILE}\` et des documents déposés — ne pas modifier à la main.`,
      "> Le registre est un **registre initial** : il ne certifie pas l'actualité des documents. Les statuts sont mis à jour après vérification documentaire.",
      "",
      "## Synthèse",
      "",
      `- ${summary}`,
      `- Par statut : ${STATUTS.map((s) => `${STATUT_LABELS[s]} ${master.filter((r) => r.statut === s).length}`).join(" · ")}`,
      "",
      "## Tableau maître",
      "",
      "| ID | Classe | Matière | Type | Titre | Année | Version | Statut | Source | Priorité | Intégration |",
      "|---|---|---|---|---|---|---|---|---|---|---|",
      ...master.map(
        (r) =>
          `| ${cell(r.id)} | ${cell(r.classes.join("-") || "toutes")} | ${cell(r.matieres.join(", ") || "toutes")} | ${cell(typeLabel(r.type))} | ${cell(r.titre)} | ${cell(orVerify(r.annee))} | ${cell(orVerify(r.version))} | ${cell(r.statut ? STATUT_LABELS[r.statut] : "À VÉRIFIER")} | ${cell(r.source)} | ${cell(r.priorite ? r.priorite.charAt(0) + r.priorite.slice(1).toLowerCase() : undefined)} | ${r.integration} |`,
      ),
      "",
      "## Couverture par classe",
      "",
      "Nombre de ressources inscrites au registre (dont intégrées). « NON ENCORE INTÉGRÉ » : aucune ressource encore identifiée — rien n'est rempli artificiellement.",
      "",
      `| Classe | ${COVERAGE.map(([l]) => l).join(" | ")} |`,
      `|---|${COVERAGE.map(() => "---").join("|")}|`,
    ];
    for (const c of CLASS_INFO) {
      const rowsForClass = master.filter((r) => r.classes.length === 0 || r.classes.some((x) => canonicalClasse(x) === c.classe));
      const cells = COVERAGE.map(([, types]) => {
        const list = rowsForClass.filter((r) => r.type && types.includes(r.type));
        const done = list.filter((r) => r.integration.startsWith("Intégré")).length;
        return list.length ? `${list.length} (${done} intégrée${done > 1 ? "s" : ""})` : "NON ENCORE INTÉGRÉ";
      });
      L.push(`| ${c.classe} | ${cells.join(" | ")} |`);
    }

    L.push("", "## Ressources consultables (intégrées)", "");
    if (usable.length) {
      for (const c of CATEGORIES.filter((x) => x.code !== "09_ARCHIVES")) {
        const docs = usable.filter((d) => d.category === c.code);
        if (!docs.length) continue;
        L.push(`### ${c.code} — ${c.label}`, "", "| ID | Titre | Statut | Niveau de source | Vérifié le | Emplacement |", "|---|---|---|---|---|---|");
        for (const d of docs) L.push(`| ${cell(d.documentId)} | ${cell(d.title)} | ${STATUT_LABELS[d.statut ?? "A_VERIFIER"]} | ${cell(d.sourceLevel)} | ${cell(d.verifiedAt)} | \`${cell(d.path)}\` |`);
        for (const d of docs.filter((x) => x.note)) L.push(`- ${d.documentId ?? d.title} : ${d.note}`);
        L.push("");
      }
    } else L.push("_Aucune ressource intégrée pour le moment._", "");

    L.push("## Ressources NON ENCORE INTÉGRÉES — où déposer les documents", "");
    if (base.pending.length) {
      L.push("| ID | Titre | Dossier de dépôt |", "|---|---|---|");
      for (const p of base.pending) L.push(`| ${cell(p.documentId)} | ${cell(p.title)} | \`${cell(p.expectedLocation)}\` |`);
    } else L.push("_Aucune._");

    L.push("", "## Historique des versions", "", "Ressources conservées mais jamais consultées comme référence.", "");
    if (history.length) {
      L.push("| ID | Titre | Version | Année | Raison | Emplacement |", "|---|---|---|---|---|---|");
      for (const h of history) L.push(`| ${cell(h.doc.documentId)} | ${cell(h.doc.title)} | ${cell(h.doc.version)} | ${cell(h.doc.year)} | ${cell(h.reason)} | \`${cell(h.doc.path)}\` |`);
    } else L.push("_Aucune version remplacée ou archivée pour le moment._");
    const links = base.docs.flatMap((d) => (d.supersedes ?? []).map((old) => `- ${old} → ${d.documentId ?? d.title} (${STATUT_LABELS[d.statut ?? "A_VERIFIER"]})`));
    if (links.length) L.push("", "### Filiations déclarées (ancienne → nouvelle)", "", ...links);

    L.push("", "## Contrôles", "");
    if (errors.length || warnings.length) for (const i of [...errors, ...warnings]) L.push(`- ${i.level === "erreur" ? "**Erreur**" : "Attention"} — \`${i.path}\` : ${i.message}`);
    else L.push("_Aucune anomalie._");
    await fs.writeFile(path.join(root, "CATALOGUE.md"), L.join("\n") + "\n");
    console.log(`Catalogue écrit : ${BASE_DIR}/CATALOGUE.md — ${summary}`);
    return;
  }

  if (cmd === "nouvel-id") {
    // Règle de mise à jour, étape 1 : créer l'ID de la nouvelle ressource (jamais réutiliser un ID existant).
    const [classeArg, matiereArg] = process.argv.slice(3);
    const cls = CLASS_INFO.find((c) => classeArg && canonicalClasse(classeArg) === c.classe);
    const codes = matiereArg ? [...subjectCodes(matiereArg)] : [];
    const subj = SUBJECTS.find((x) => codes.includes(x.code));
    if (!cls || !subj) {
      console.log("Usage : npm run base:nouvel-id -- <classe> <matière>   (ex. npm run base:nouvel-id -- 6e Mathématiques)");
      process.exitCode = 2;
      return;
    }
    const prefix = `BF-${cls.code}-${subj.code}-`;
    const used = [...base.registry.map((e) => e.meta.documentId), ...base.docs.map((d) => d.documentId), ...base.pending.map((p) => p.documentId)]
      .filter((x): x is string => !!x && x.toUpperCase().startsWith(prefix))
      .map((x) => Number.parseInt(x.slice(prefix.length), 10))
      .filter((n, i, all) => Number.isFinite(n) && all.indexOf(n) === i);
    const next = `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
    console.log(next);
    if (used.length) console.log(`(déjà utilisés : ${used.sort((a, b) => a - b).map((n) => prefix + String(n).padStart(3, "0")).join(", ")})`);
    return;
  }

  console.log("Usage : npm run base:verifier | npm run base:catalogue | npm run base:nouvel-id -- <classe> <matière>");
  process.exitCode = 2;
}

void main();
