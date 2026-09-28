import "server-only";
import Anthropic from "@anthropic-ai/sdk";
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
export function aiErrorMessage(e: unknown): string {
  const retry = "PÉDAGOGUE.IA n'a pas pu répondre (service momentanément indisponible). Réessayez dans un instant.";
  if (e instanceof AiUnavailableError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "La clé API configurée (ANTHROPIC_API_KEY) est invalide ou a été supprimée. Prévenez l'administrateur.";
  if (e instanceof Anthropic.PermissionDeniedError) return "La clé API n'a pas l'autorisation d'utiliser ce service ou ce modèle. Prévenez l'administrateur.";
  if (e instanceof Anthropic.NotFoundError) return `Le modèle configuré (${aiConfig().model}) n'est pas accessible avec cette clé API. Prévenez l'administrateur (variable KIBARU_MODEL).`;
  if (e instanceof Anthropic.RateLimitError) return "Le service est très sollicité ou la limite de dépenses du compte est atteinte. Réessayez dans une minute.";
  if (e instanceof Anthropic.BadRequestError) {
    const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
    if (/credit balance|billing|purchase credits/i.test(detail))
      return "Le crédit du compte Anthropic est épuisé ou non activé. L'administrateur doit ajouter du crédit sur platform.claude.com (Billing).";
    return `Le service d'IA a refusé la requête (${detail.slice(0, 300)}). Prévenez l'administrateur.`;
  }
  return retry;
}

const EFFORTS = ["low", "medium", "high"] as const;
type Effort = (typeof EFFORTS)[number];

export function aiConfig() {
  const model = process.env.KIBARU_MODEL?.trim() || "claude-opus-5";
  const e = process.env.KIBARU_EFFORT?.trim() as Effort | undefined;
  const effort: Effort = e && (EFFORTS as readonly string[]).includes(e) ? e : "medium";
  return { model, effort, configured: !!process.env.ANTHROPIC_API_KEY };
}

// Modèles pour lesquels l'API propose le repli automatique en cas de refus.
const FALLBACK_MODELS = /^claude-(opus-5|fable-5)/;

export type StreamEnd = "ok" | "refusal" | "max_tokens";

export async function* streamAnswer(messages: Anthropic.Beta.BetaMessageParam[]): AsyncGenerator<string, StreamEnd, void> {
  const { model, effort, configured } = aiConfig();
  if (!configured) throw new AiUnavailableError();
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
  if (final.stop_reason === "refusal") return "refusal";
  if (final.stop_reason === "max_tokens") return "max_tokens";
  return "ok";
}
