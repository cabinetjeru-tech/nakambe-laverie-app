import { z } from "zod";
import { assertUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { checkQuota } from "@/lib/ai/quota";
import { synthesize } from "@/lib/ai/speech";
import { AiUnavailableError } from "@/lib/ai/llm";

export const runtime = "nodejs";

export const POST = handle(async (req: Request) => {
  const user = await assertUser();
  if (!rateLimit(`tts:${user.id}`, 20, 60_000).ok) return jsonError(429, "Trop de requêtes vocales, patientez un instant.");
  const quota = await checkQuota(user, "TTS");
  if (!quota.ok) return jsonError(429, quota.message);
  const body = z.object({ text: z.string().min(1).max(4000) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError(400, "Texte invalide.");
  try {
    const audio = await synthesize(body.data.text, user.id);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AiUnavailableError) return jsonError(503, e.message);
    throw e;
  }
});
