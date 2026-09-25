import "server-only";
import OpenAI from "openai";
import { getAiSettings, getSecret } from "../settings";
import { recordUsage } from "./quota";

export const EMBEDDING_DIMENSIONS = 1536;

/** Renvoie null si aucun fournisseur d'embeddings n'est configuré (repli : recherche plein texte). */
export async function embed(texts: string[], userId: string | null = null): Promise<number[][] | null> {
  const key = await getSecret("ai.openaiKey");
  if (!key || texts.length === 0) return null;
  const s = await getAiSettings();
  const c = new OpenAI({ apiKey: key });
  const out: number[][] = [];
  let tokens = 0;
  let ok = false;
  try {
    for (let i = 0; i < texts.length; i += 96) {
      const batch = texts.slice(i, i + 96).map((t) => t.slice(0, 8000));
      const res = await c.embeddings.create({ model: s.embeddingModel, input: batch, dimensions: EMBEDDING_DIMENSIONS });
      tokens += res.usage?.total_tokens ?? 0;
      for (const d of res.data) out.push(d.embedding);
    }
    ok = true;
    return out;
  } finally {
    await recordUsage({ userId, feature: "EMBEDDING", provider: "openai", model: s.embeddingModel, inputTokens: tokens, success: ok });
  }
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(7) : "0")).join(",")}]`;
}
