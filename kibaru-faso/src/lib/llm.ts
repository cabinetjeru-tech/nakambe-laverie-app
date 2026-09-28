import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt";

/** Appel à Claude en flux (streaming) avec le prompt système MON PROF.IA. */

export class AiUnavailableError extends Error {
  constructor() {
    super("L'assistant n'est pas encore configuré : l'administrateur doit renseigner la clé ANTHROPIC_API_KEY.");
  }
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
