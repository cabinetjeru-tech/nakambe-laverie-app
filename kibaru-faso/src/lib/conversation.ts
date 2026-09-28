import { z } from "zod";

/** Schéma des requêtes de conversation et construction du message transmis au modèle. */

export const MAX_TEACHER_DOCS_CHARS = 1_500_000;

/** Types de séance (Module 01 — fiches pédagogiques). */
export const TYPES_SEANCE = ["découverte", "apprentissage", "application", "consolidation", "révision", "remédiation", "évaluation"] as const;
/** Modes de production d'une fiche : standard, expert (plus de détails), rapide (l'essentiel). */
export const MODES = ["standard", "expert", "rapide"] as const;

const txt = (max: number) => z.string().max(max).optional();

export const teacherContextSchema = z.object({
  // Classe et séance
  classe: txt(40),
  discipline: txt(80),
  theme: txt(300),
  sousTheme: txt(300),
  typeSeance: txt(40),
  duree: txt(60),
  effectif: txt(40),
  niveau: txt(300),
  // Informations pédagogiques facultatives (jamais bloquantes)
  prerequis: txt(500),
  materiel: txt(500),
  methode: txt(300),
  contexteParticulier: txt(500),
  objectifPersonnel: txt(500),
  // Profil de l'enseignant (personnalisation uniquement)
  enseignant: txt(120),
  etablissement: txt(160),
  ville: txt(120),
  anneeScolaire: txt(20),
  preferences: txt(500),
  mode: txt(20),
});
export type TeacherContext = z.infer<typeof teacherContextSchema>;

export const chatRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(60_000) }))
    .min(1)
    .max(40),
  context: teacherContextSchema.default({}),
  documents: z
    .array(
      z.object({
        id: z.string().max(80),
        title: z.string().max(200),
        type: z.string().max(80).default("document de l'enseignant"),
        text: z.string(),
      }),
    )
    .max(20)
    .default([]),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

const LABELS: Record<keyof TeacherContext, string> = {
  classe: "Classe",
  discipline: "Discipline",
  theme: "Thème / chapitre",
  sousTheme: "Sous-thème / notion",
  typeSeance: "Type de séance",
  duree: "Durée de la séance",
  effectif: "Nombre approximatif d'apprenants",
  niveau: "Niveau général et difficultés de la classe",
  prerequis: "Prérequis déjà maîtrisés",
  materiel: "Matériel disponible",
  methode: "Méthode souhaitée",
  contexteParticulier: "Contexte particulier",
  objectifPersonnel: "Objectif personnel de la séance",
  enseignant: "Enseignant",
  etablissement: "Établissement",
  ville: "Ville",
  anneeScolaire: "Année scolaire",
  preferences: "Préférences pédagogiques (personnalisation, sans effet sur les exigences officielles)",
  mode: "Mode de production souhaité",
};

export function formatContextBlock(ctx: TeacherContext): string {
  const lines = (Object.keys(LABELS) as (keyof TeacherContext)[])
    .map((k) => [LABELS[k], ctx[k]?.trim()] as const)
    .filter(([, v]) => !!v)
    .map(([l, v]) => `- ${l} : ${v!.replace(/[<>]/g, "")}`);
  return lines.length ? `<contexte_classe>\n${lines.join("\n")}\n</contexte_classe>` : "";
}

/** Garde les derniers échanges en respectant l'alternance utilisateur / assistant exigée par l'API. */
export function normalizeHistory(messages: ChatRequest["messages"], maxMessages = 16): ChatRequest["messages"] {
  const merged: ChatRequest["messages"] = [];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else merged.push({ ...m });
  }
  let out = merged.slice(-maxMessages);
  while (out.length && out[0]!.role !== "user") out = out.slice(1);
  return out;
}

/** Texte de recherche : la demande actuelle, enrichie des dernières demandes et du contexte. */
export function searchQuery(messages: ChatRequest["messages"], ctx: TeacherContext): string {
  const users = messages.filter((m) => m.role === "user").map((m) => m.content);
  const current = users[users.length - 1] ?? "";
  const previous = users.slice(-3, -1).join(" ").slice(0, 600);
  return [current, current, previous, ctx.theme, ctx.sousTheme, ctx.sousTheme, ctx.typeSeance, ctx.discipline].filter(Boolean).join(" ");
}
