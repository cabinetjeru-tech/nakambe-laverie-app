import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Consommation } from "./couts";
import { SYSTEM_PROMPT } from "./prompt";

/** Appel à Claude en flux (streaming) avec le prompt système PÉDAGOGUE.IA. */

export class AiUnavailableError extends Error {
  constructor() {
    super("L'assistant n'est pas encore configuré : l'administrateur doit renseigner la clé ANTHROPIC_API_KEY.");
  }
}

/**
 * Message affiché à l'enseignant selon l'erreur du service d'IA : la cause réelle (crédit, clé, accès au modèle…)
 * pour que l'administrateur sache quoi corriger. Les erreurs de connexion ou de surcharge restent « réessayez ».
 */
/** Clé copiée tronquée depuis la console (« sk-ant-…abcd ») ou avec des espaces : elle ne peut même pas être envoyée. */
export class CleInvalideError extends Error {
  constructor() {
    super(
      "La clé ANTHROPIC_API_KEY enregistrée dans Vercel est incomplète (elle contient « … » ou un espace) : c'est la version masquée affichée par la console Anthropic. L'administrateur doit créer une nouvelle clé et la copier en entier au moment de sa création.",
    );
  }
}

export function cleApiValide(cle = process.env.ANTHROPIC_API_KEY ?? ""): boolean {
  return /^[\x21-\x7e]+$/.test(cle.trim());
}

export function aiErrorMessage(e: unknown): string {
  const retry = "PÉDAGOGUE.IA n'a pas pu répondre (service momentanément indisponible). Réessayez dans un instant.";
  if (e instanceof AiUnavailableError || e instanceof CleInvalideError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "La clé API configurée (ANTHROPIC_API_KEY) est invalide ou a été supprimée. Prévenez l'administrateur.";
  if (e instanceof Anthropic.PermissionDeniedError) return "La clé API n'a pas l'autorisation d'utiliser ce service ou ce modèle. Prévenez l'administrateur.";
  if (e instanceof Anthropic.NotFoundError) return `Le modèle configuré (${aiConfig().model}) n'est pas accessible avec cette clé API. Prévenez l'administrateur (variables KIBARU_MODEL / KIBARU_MODEL_EXPERT).`;
  if (e instanceof Anthropic.RateLimitError) return "Le service est très sollicité ou la limite de dépenses du compte est atteinte. Réessayez dans une minute.";
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "Le service d'IA a mis trop de temps à répondre. Réessayez ; si cela se répète, prévenez l'administrateur.";
  if (e instanceof Anthropic.APIConnectionError) return "Connexion au service d'IA impossible depuis le serveur. Prévenez l'administrateur.";
  if (e instanceof Anthropic.InternalServerError && e.status === 529) return "Le service d'IA est momentanément surchargé. Réessayez dans une minute.";
  if (e instanceof Anthropic.BadRequestError) {
    const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
    if (/credit balance|billing|purchase credits/i.test(detail))
      return "Le crédit du compte Anthropic est épuisé ou non activé. L'administrateur doit ajouter du crédit sur platform.claude.com (Billing).";
    return `Le service d'IA a refusé la requête (${detail.slice(0, 300)}). Prévenez l'administrateur.`;
  }
  return retry;
}

/** Détail technique d'une erreur (classe, statut HTTP, type, message, cause réseau, identifiant de requête), pour le journal. */
export function detailErreur(e: unknown): string {
  const err = e as Error & { status?: number; requestID?: string | null; error?: { error?: { type?: string; message?: string } }; cause?: { code?: string; message?: string } };
  const type = err?.error?.error?.type;
  const cause = err?.cause ? ` [cause : ${[err.cause.code, err.cause.message].filter(Boolean).join(" — ")}]` : "";
  return `${err?.constructor?.name ?? "Erreur"}${err?.status ? ` ${err.status}` : ""}${type ? ` ${type}` : ""} : ${err?.message ?? String(e)}${cause}${err?.requestID ? ` (requête ${err.requestID})` : ""}`;
}

const EFFORTS = ["low", "medium", "high"] as const;
type Effort = (typeof EFFORTS)[number];

/**
 * Modèle « mixte » : Sonnet pour les préparations courantes, Opus pour le mode expert (analyse plus poussée).
 * Réglables par KIBARU_MODEL et KIBARU_MODEL_EXPERT.
 */
export function aiConfig(mode?: string) {
  const model =
    mode === "expert"
      ? process.env.KIBARU_MODEL_EXPERT?.trim() || "claude-opus-5-5"
      : process.env.KIBARU_MODEL?.trim() || "claude-sonnet-5-5";
  const e = process.env.KIBARU_EFFORT?.trim() as Effort | undefined;
  const effort: Effort = e && (EFFORTS as readonly string[]).includes(e) ? e : "medium";
  return { model, effort, configured: !!process.env.ANTHROPIC_API_KEY };
}

// Modèles pour lesquels l'API propose le repli automatique en cas de refus.
const FALLBACK_MODELS = /^claude-(opus-5|fable-5)/;

export type StreamEnd = {
  fin: "ok" | "refusal" | "max_tokens";
  /** Modèle réellement utilisé (peut différer en cas de repli automatique). */
  modele: string;
  consommation: Consommation;
};

export async function* streamAnswer(messages: Anthropic.Beta.BetaMessageParam[], mode?: string): AsyncGenerator<string, StreamEnd, void> {
  const { model, effort, configured } = aiConfig(mode);
  if (!configured) throw new AiUnavailableError();
  if (!cleApiValide()) throw new CleInvalideError();
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages,
    thinking: { type: "adaptive" },
    output_config: { effort },
    ...(FALLBACK_MODELS.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
  const final = await stream.finalMessage();
  const u = final.usage;
  const consommation: Consommation = {
    entree: u?.input_tokens ?? 0,
    sortie: u?.output_tokens ?? 0,
    cacheLecture: u?.cache_read_input_tokens ?? 0,
    cacheEcriture: u?.cache_creation_input_tokens ?? 0,
  };
  const fin = final.stop_reason === "refusal" ? "refusal" : final.stop_reason === "max_tokens" ? "max_tokens" : "ok";
  return { fin, modele: final.model || model, consommation };
}

/**
 * Diagnostic (espace admin) : petite requête avec la même configuration que les préparations (modèle, réflexion,
 * repli automatique). Renvoie le modèle qui a répondu et la durée, ou la cause exacte de l'échec.
 */
export async function testerIA(mode?: string): Promise<{ ok: boolean; message: string }> {
  const { model, configured } = aiConfig(mode);
  if (!configured) return { ok: false, message: "ANTHROPIC_API_KEY absente dans Vercel." };
  if (!cleApiValide()) return { ok: false, message: new CleInvalideError().message };
  const debut = Date.now();
  try {
    const client = new Anthropic({ maxRetries: 0 });
    const r = await client.beta.messages.create({
      model,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Réponds seulement : OK" }],
      ...(FALLBACK_MODELS.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    const texte = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return { ok: true, message: `${r.model} a répondu « ${texte.slice(0, 40)} » en ${((Date.now() - debut) / 1000).toFixed(1)} s (arrêt : ${r.stop_reason}).` };
  } catch (e) {
    return { ok: false, message: `${model} : ${detailErreur(e)}` };
  }
}
