import { NextResponse } from "next/server";
import { assertUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { checkQuota } from "@/lib/ai/quota";
import { transcribe } from "@/lib/ai/speech";
import { AiUnavailableError } from "@/lib/ai/llm";
import { detectFileType } from "@/lib/uploads";

export const runtime = "nodejs";

export const POST = handle(async (req: Request) => {
  const user = await assertUser();
  if (!rateLimit(`stt:${user.id}`, 15, 60_000).ok) return jsonError(429, "Trop de requêtes vocales, patientez un instant.");
  const quota = await checkQuota(user, "STT");
  if (!quota.ok) return jsonError(429, quota.message);
  const fd = await req.formData();
  const audio = fd.get("audio");
  if (!audio || typeof audio === "string") return jsonError(400, "Enregistrement manquant.");
  if (audio.size > 15 * 1024 * 1024) return jsonError(413, "Enregistrement trop long.");
  const buf = Buffer.from(await audio.arrayBuffer());
  const t = detectFileType(buf, audio.name || "voix.webm");
  if (!t || !(t.mime.startsWith("audio/") || t.mime === "video/webm" || t.mime === "video/mp4")) return jsonError(415, "Format audio non pris en charge.");
  try {
    const text = await transcribe(buf, `voix.${t.ext === "mp4" ? "m4a" : t.ext}`, user.id);
    return NextResponse.json({ text });
  } catch (e) {
    if (e instanceof AiUnavailableError) return jsonError(503, e.message);
    throw e;
  }
});
