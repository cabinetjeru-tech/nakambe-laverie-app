import { NextResponse } from "next/server";
import { z } from "zod";
import { assertUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { validateUpload } from "@/lib/uploads";
import { deleteS3Object, inspectS3Object, isDirectUploadAvailable, newStorageKey, presignedPutUrl, registerStoredObject } from "@/lib/storage";
import { linkUpload, resolveUploadTarget, type UploadParams } from "@/lib/upload-targets";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Envoi direct navigateur → stockage S3 (Supabase Storage, R2, AWS…), en deux temps :
 *  1. { step: "init" } : vérification des droits, clé de stockage et URL présignée (PUT, 1 h) ;
 *  2. { step: "complete" } : contrôle de la taille et du vrai type (premiers octets), enregistrement et rattachement.
 * Un jeton HMAC lie l'étape 2 à l'utilisateur, à la clé et aux paramètres de l'étape 1.
 * Réponse { mode: "server" } si le stockage n'est pas S3 : le client utilise alors /api/upload.
 */
const schema = z.object({
  step: z.enum(["init", "complete"]),
  purpose: z.string().max(30),
  targetId: z.string().max(40).default(""),
  kind: z.string().max(10).default("DOCUMENT"),
  label: z.string().max(200).nullish(),
  lang: z.string().max(10).nullish(),
  downloadable: z.string().max(2).nullish(),
  lessonId: z.string().max(40).nullish(),
  filename: z.string().min(1).max(200),
  contentType: z.string().max(120).default("application/octet-stream"),
  size: z.number().int().positive(),
  key: z.string().max(300).optional(),
  token: z.string().max(200).optional(),
});

export const POST = handle(async (req: Request) => {
  const user = await assertUser();
  if (!isDirectUploadAvailable()) return NextResponse.json({ mode: "server" });
  if (!rateLimit(`upload:${user.id}`, 60, 10 * 60_000).ok) return jsonError(429, "Trop de téléversements, patientez.");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Requête invalide.");
  const b = parsed.data;
  const params: UploadParams = { purpose: b.purpose, targetId: b.targetId, kind: b.kind, label: b.label, lang: b.lang, downloadable: b.downloadable, lessonId: b.lessonId };
  const target = await resolveUploadTarget(user, params);
  if ("error" in target) return jsonError(target.status, target.error);
  if (b.size > target.maxBytes) return jsonError(413, `Fichier trop volumineux (max ${Math.round(target.maxBytes / 1048576)} Mo).`);
  const sign = (key: string) => hmacHex(env.fileSigningSecret, [user.id, key, b.purpose, b.targetId, b.kind, b.filename].join("|"));

  if (b.step === "init") {
    const key = newStorageKey(target.folder, b.filename);
    const contentType = b.contentType || "application/octet-stream";
    return NextResponse.json({ mode: "direct", key, token: sign(key), url: await presignedPutUrl(key, contentType), contentType });
  }

  if (!b.key || !b.token || !safeEqual(sign(b.key), b.token)) return jsonError(403, "Jeton d'envoi invalide.");
  let info: { size: number; head: Buffer };
  try {
    info = await inspectS3Object(b.key);
  } catch {
    return jsonError(400, "Fichier introuvable dans le stockage : l'envoi n'a pas abouti.");
  }
  const reject = async (status: number, msg: string) => {
    await deleteS3Object(b.key!).catch(() => undefined);
    return jsonError(status, msg);
  };
  if (info.size > target.maxBytes) return reject(413, "Fichier trop volumineux.");
  // Contrôle du type réel sur les premiers octets (la taille est vérifiée séparément).
  const check = validateUpload(info.head, b.filename, target.category, Number.MAX_SAFE_INTEGER);
  if (!check.ok) return reject(415, check.error);
  const stored = await registerStoredObject({ key: b.key, originalName: b.filename, mimeType: check.mime, size: info.size, ownerId: user.id, visibility: target.visibility });
  await linkUpload(user, target, params, stored, info.head);
  return NextResponse.json({ id: stored.id, url: target.visibility === "PUBLIC" ? `/api/files/${stored.id}` : null });
});
