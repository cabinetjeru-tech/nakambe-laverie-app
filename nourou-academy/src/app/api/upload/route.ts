import { NextResponse } from "next/server";
import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { storeBuffer } from "@/lib/storage";
import { validateUpload } from "@/lib/uploads";
import { rateLimit } from "@/lib/rate-limit";
import { linkUpload, paramsFromUrl, resolveUploadTarget } from "@/lib/upload-targets";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Téléversement via le serveur (corps brut écrit en flux sur disque : pas de saturation mémoire).
 * Utilisé avec le stockage local. Avec un stockage S3, le navigateur envoie directement
 * le fichier au stockage (voir /api/upload/direct) — indispensable sur Vercel (corps limité à 4,5 Mo).
 * Paramètres (query) : purpose, targetId, kind, label, lang, downloadable ; en-tête X-Filename.
 */
export const POST = handle(async (req: Request) => {
  const user = await assertUser();
  if (!rateLimit(`upload:${user.id}`, 30, 10 * 60_000).ok) return jsonError(429, "Trop de téléversements, patientez.");
  const params = paramsFromUrl(new URL(req.url));
  const filename = decodeURIComponent(req.headers.get("x-filename") ?? "fichier").slice(0, 200);
  const target = await resolveUploadTarget(user, params);
  if ("error" in target) return jsonError(target.status, target.error);
  const maxMb = Math.round(target.maxBytes / 1048576);
  if (Number(req.headers.get("content-length") ?? 0) > target.maxBytes) return jsonError(413, `Fichier trop volumineux (max ${maxMb} Mo).`);
  if (!req.body) return jsonError(400, "Fichier manquant.");

  const tmp = path.join(tmpdir(), `nga-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let received = 0;
  const limiter = async function* (source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      received += chunk.length;
      if (received > target.maxBytes) throw new Error("TOO_LARGE");
      yield chunk;
    }
  };
  try {
    await pipeline(Readable.fromWeb(req.body as never), limiter, createWriteStream(tmp));
  } catch (e) {
    await fs.rm(tmp, { force: true });
    if ((e as Error).message === "TOO_LARGE") return jsonError(413, `Fichier trop volumineux (max ${maxMb} Mo).`);
    return jsonError(400, "Téléversement interrompu. Réessayez.");
  }
  const buffer = await fs.readFile(tmp);
  await fs.rm(tmp, { force: true });
  const check = validateUpload(buffer, filename, target.category, target.maxBytes);
  if (!check.ok) return jsonError(415, check.error);
  const stored = await storeBuffer({ buffer, originalName: filename, mimeType: check.mime, ownerId: user.id, visibility: target.visibility, folder: target.folder });
  await linkUpload(user, target, params, stored, buffer.subarray(0, 65536));
  return NextResponse.json({ id: stored.id, url: target.visibility === "PUBLIC" ? `/api/files/${stored.id}` : null });
});
