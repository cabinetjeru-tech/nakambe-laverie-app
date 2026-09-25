import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getAiSettings, getSecret, type AiSettings } from "../settings";
import { recordUsage } from "./quota";

/**
 * Couche d'abstraction des modèles de langage.
 * Fournisseurs pris en charge : Anthropic (Claude) et OpenAI — sélection et modèles
 * configurables dans Administration › Paramètres › IA. Les clés restent côté serveur.
 */

export type LlmPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string }
  | { type: "pdf"; data: string };

export type LlmMessage = { role: "user" | "assistant"; content: string | LlmPart[] };

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  feature: "TUTOR" | "GRADING" | "GENERATOR" | "VISION";
  userId: string | null;
};

export class AiUnavailableError extends Error {
  constructor(message = "Le service d'IA n'est pas configuré. Un administrateur doit renseigner une clé API.") {
    super(message);
  }
}

export type ProviderInfo = { provider: "anthropic" | "openai"; model: string; settings: AiSettings };

/** Détermine le fournisseur effectivement utilisable (configuré + clé présente). */
export async function resolveProvider(): Promise<ProviderInfo & { key: string }> {
  const s = await getAiSettings();
  const anthropicKey = await getSecret("ai.anthropicKey");
  const openaiKey = await getSecret("ai.openaiKey");
  const order: ("anthropic" | "openai")[] = s.provider === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];
  for (const p of order) {
    if (p === "anthropic" && anthropicKey) return { provider: p, model: s.anthropicModel, settings: s, key: anthropicKey };
    if (p === "openai" && openaiKey) return { provider: p, model: s.openaiModel, settings: s, key: openaiKey };
  }
  throw new AiUnavailableError();
}

export async function aiStatus() {
  const s = await getAiSettings();
  const anthropic = !!(await getSecret("ai.anthropicKey"));
  const openai = !!(await getSecret("ai.openaiKey"));
  return {
    chat: anthropic || openai,
    provider: s.provider === "openai" ? (openai ? "openai" : anthropic ? "anthropic" : null) : anthropic ? "anthropic" : openai ? "openai" : null,
    embeddings: openai, // embeddings via OpenAI ; sinon recherche plein texte
    voiceServer: openai, // transcription + synthèse vocale serveur via OpenAI
    vision: anthropic || openai,
  };
}

// Modèles pour lesquels le repli serveur en cas de refus est proposé par l'API Anthropic.
const FALLBACK_MODELS = /^claude-(opus-5|fable-5)/;

function toAnthropicContent(content: string | LlmPart[]): Anthropic.Beta.BetaContentBlockParam[] | string {
  if (typeof content === "string") return content;
  return content.map((p): Anthropic.Beta.BetaContentBlockParam => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.type === "image") return { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } };
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data } };
  });
}

function toOpenAiContent(content: string | LlmPart[]): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (typeof content === "string") return content;
  return content.map((p): OpenAI.Chat.Completions.ChatCompletionContentPart => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.type === "image") return { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } };
    return { type: "file", file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${p.data}` } };
  });
}

/**
 * Génération en flux (streaming). Renvoie un itérateur asynchrone de fragments de texte.
 * L'usage (tokens) est journalisé à la fin pour les quotas et le suivi des coûts.
 */
export async function* streamText(req: LlmRequest): AsyncGenerator<string, void, void> {
  const p = await resolveProvider();
  let inputTokens = 0;
  let outputTokens = 0;
  let success = false;
  try {
    if (p.provider === "anthropic") {
      const client = new Anthropic({ apiKey: p.key });
      const useFallback = FALLBACK_MODELS.test(p.model);
      const stream = client.beta.messages.stream({
        model: p.model,
        max_tokens: req.maxTokens ?? 16000,
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: req.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
        thinking: { type: "adaptive" },
        output_config: { effort: p.settings.anthropicEffort },
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
      }
      const final = await stream.finalMessage();
      inputTokens = final.usage.input_tokens + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0);
      outputTokens = final.usage.output_tokens;
      if (final.stop_reason === "refusal") {
        yield "\n\n_Je ne peux pas répondre à cette demande. Reformule ta question en lien avec ta formation._";
      } else if (final.stop_reason === "max_tokens") {
        yield "\n\n_(Réponse tronquée : demande-moi de continuer.)_";
      }
    } else {
      const client = new OpenAI({ apiKey: p.key });
      const stream = await client.chat.completions.create({
        model: p.model,
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: req.maxTokens ?? 16000,
        messages: [
          { role: "system", content: req.system },
          ...req.messages.map((m) =>
            m.role === "user"
              ? ({ role: "user", content: toOpenAiContent(m.content) } as OpenAI.Chat.Completions.ChatCompletionUserMessageParam)
              : ({ role: "assistant", content: typeof m.content === "string" ? m.content : m.content.map((c) => (c.type === "text" ? c.text : "")).join("\n") } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam),
          ),
        ],
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
    }
    success = true;
  } finally {
    await recordUsage({ userId: req.userId, feature: req.feature, provider: p.provider, model: p.model, inputTokens, outputTokens, success });
  }
}

export async function generateText(req: LlmRequest): Promise<string> {
  let out = "";
  for await (const t of streamText(req)) out += t;
  return out;
}

/**
 * Génération d'un objet JSON conforme à un schéma (sorties structurées).
 * Utilisé pour la correction (barème, feedback) et le générateur de quiz.
 */
export async function generateJson<T>(req: LlmRequest & { schema: Record<string, unknown>; schemaName: string }): Promise<T> {
  const p = await resolveProvider();
  let inputTokens = 0;
  let outputTokens = 0;
  let success = false;
  try {
    let text = "";
    if (p.provider === "anthropic") {
      const client = new Anthropic({ apiKey: p.key });
      const useFallback = FALLBACK_MODELS.test(p.model);
      const stream = client.beta.messages.stream({
        model: p.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
        thinking: { type: "adaptive" },
        output_config: { effort: p.settings.anthropicEffort, format: { type: "json_schema", schema: req.schema } },
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      const final = await stream.finalMessage();
      inputTokens = final.usage.input_tokens;
      outputTokens = final.usage.output_tokens;
      if (final.stop_reason === "refusal") throw new Error("La demande a été refusée par le modèle.");
      for (const b of final.content) if (b.type === "text") text += b.text;
    } else {
      const client = new OpenAI({ apiKey: p.key });
      const res = await client.chat.completions.create({
        model: p.model,
        max_completion_tokens: req.maxTokens ?? 16000,
        response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: req.schema, strict: true } },
        messages: [
          { role: "system", content: req.system },
          ...req.messages.map((m) =>
            m.role === "user"
              ? ({ role: "user", content: toOpenAiContent(m.content) } as OpenAI.Chat.Completions.ChatCompletionUserMessageParam)
              : ({ role: "assistant", content: String(m.content) } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam),
          ),
        ],
      });
      inputTokens = res.usage?.prompt_tokens ?? 0;
      outputTokens = res.usage?.completion_tokens ?? 0;
      text = res.choices[0]?.message?.content ?? "";
    }
    const parsed = JSON.parse(text) as T;
    success = true;
    return parsed;
  } finally {
    await recordUsage({ userId: req.userId, feature: req.feature, provider: p.provider, model: p.model, inputTokens, outputTokens, success });
  }
}
