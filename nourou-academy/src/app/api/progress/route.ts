import { NextResponse } from "next/server";
import { z } from "zod";
import { assertUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { lessonAccess } from "@/lib/access";
import { saveLessonProgress } from "@/lib/learning/progress";
import { evaluateCertificate } from "@/lib/certificates/issue";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ lessonId: z.string().min(1).max(40), position: z.number().min(0).max(24 * 3600).optional(), completed: z.boolean().optional() });

/** Sauvegarde de la progression (appelée par le lecteur vidéo et la file hors ligne). */
export const POST = handle(async (req: Request) => {
  const user = await assertUser();
  if (!rateLimit(`progress:${user.id}`, 120, 60_000).ok) return jsonError(429, "Trop de requêtes.");
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError(400, "Requête invalide.");
  const acc = await lessonAccess(user, body.data.lessonId);
  if (!acc.allowed) return jsonError(403, "Accès refusé.");
  const courseId = await saveLessonProgress(user.id, body.data.lessonId, { position: body.data.position, completed: body.data.completed });
  if (courseId && body.data.completed) await evaluateCertificate(user.id, courseId);
  return NextResponse.json({ ok: true });
});
