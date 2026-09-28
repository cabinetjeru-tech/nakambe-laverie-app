import { z } from "zod";

/** Schéma des requêtes de conversation et construction du message transmis au modèle. */

export const MAX_TEACHER_DOCS_CHARS = 1_500_000;

export const teacherContextSchema = z.object({
  etablissement: z.string().max(160).optional(),
  classe: z.string().max(40).optional(),
  discipline: z.string().max(80).optional(),
  theme: z.string().max(300).optional(),
  duree: z.string().max(60).optional(),
  niveau: z.string().max(300).optional(),
  effectif: z.string().max(40).optional(),
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
  etablissement: "Établissement",
  classe: "Classe",
  discipline: "Discipline",
  theme: "Thème / chapitre",
  duree: "Durée de la séance",
  niveau: "Niveau et difficultés de la classe",
  effectif: "Effectif",
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
  return [current, current, previous, ctx.theme, ctx.discipline].filter(Boolean).join(" ");
}
