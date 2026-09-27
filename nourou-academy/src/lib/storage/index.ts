import "server-only";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "../db";
import { hmacHex, randomToken, safeEqual } from "../crypto";
import { env } from "../env";

/**
 * Stockage des fichiers :
 *  - "local" : disque du serveur (STORAGE_LOCAL_DIR), servi par /api/files/[id] avec URL signée ;
 *  - "s3"    : tout stockage compatible S3 (AWS S3, Cloudflare R2, Wasabi, MinIO, Supabase Storage S3).
 * Les fichiers privés ne sont jamais servis sans URL signée à durée limitée.
 */

type Driver = "local" | "s3";

function driverName(): Driver {
  return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
}

function localDir() {
  return path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || "./storage");
}

let s3: S3Client | null = null;
function s3Client() {
  if (!s3) {
    s3 = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return s3;
}
const bucket = () => process.env.S3_BUCKET || "";

function safeKeyPath(key: string) {
  const p = path.resolve(localDir(), key);
  if (!p.startsWith(localDir() + path.sep)) throw new Error("Clé de fichier invalide");
  return p;
}

export function isDirectUploadAvailable() {
  return driverName() === "s3";
}

export function newStorageKey(folder: string, originalName: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8);
  return `${folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}${ext}`;
}

/** URL présignée d'envoi direct navigateur → stockage S3 (valable 1 h). */
export async function presignedPutUrl(key: string, contentType: string) {
  return getSignedUrl(s3Client(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: 3600 });
}

/** Taille et premiers octets d'un objet déjà envoyé (contrôle du vrai type de fichier). */
export async function inspectS3Object(key: string) {
  const head = await s3Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  const part = await s3Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: "bytes=0-65535" }));
  return { size: Number(head.ContentLength ?? 0), head: Buffer.from(await part.Body!.transformToByteArray()) };
}

export async function deleteS3Object(key: string) {
  await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function registerStoredObject(opts: { key: string; originalName: string; mimeType: string; size: number; ownerId: string; visibility: "PUBLIC" | "PRIVATE" }) {
  return prisma.storedFile.create({ data: { ...opts, driver: "s3", originalName: opts.originalName.slice(0, 200) } });
}

export async function storeBuffer(opts: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  ownerId: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  folder: string;
}) {
  const ext = path.extname(opts.originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8);
  const key = `${opts.folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}${ext}`;
  const driver = driverName();
  if (driver === "s3") {
    await s3Client().send(
      new PutObjectCommand({ Bucket: bucket(), Key: key, Body: opts.buffer, ContentType: opts.mimeType }),
    );
  } else {
    const p = safeKeyPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, opts.buffer);
  }
  return prisma.storedFile.create({
    data: {
      key,
      driver,
      originalName: opts.originalName.slice(0, 200),
      mimeType: opts.mimeType,
      size: opts.buffer.length,
      ownerId: opts.ownerId,
      visibility: opts.visibility,
    },
  });
}

export async function readFileBuffer(file: { key: string; driver: string }): Promise<Buffer> {
  if (file.driver === "s3") {
    const res = await s3Client().send(new GetObjectCommand({ Bucket: bucket(), Key: file.key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  return fs.readFile(safeKeyPath(file.key));
}

export async function deleteStoredFile(fileId: string) {
  const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!file) return;
  try {
    if (file.driver === "s3") await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: file.key }));
    else await fs.unlink(safeKeyPath(file.key));
  } catch (e) {
    console.error("[storage] suppression impossible", (e as Error).message);
  }
  await prisma.storedFile.delete({ where: { id: fileId } });
}

/** Flux local avec prise en charge des requêtes partielles (Range) pour la vidéo et la reprise des téléchargements. */
export async function localStream(key: string, range?: { start: number; end?: number }) {
  const p = safeKeyPath(key);
  const stat = await fs.stat(p);
  const stream = createReadStream(p, range ? { start: range.start, end: range.end } : undefined);
  return { stream: Readable.toWeb(stream) as ReadableStream, size: stat.size };
}

export async function s3PresignedUrl(key: string, filename: string, download: boolean, expiresIn = 3600) {
  return getSignedUrl(
    s3Client(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    }),
    { expiresIn },
  );
}

/** URL signée interne (valable `ttlSeconds`) pour un fichier privé. */
/**
 * URL signée à durée limitée. Le mode (consultation en ligne ou téléchargement) fait partie de la signature :
 * un lien de consultation ne peut pas être transformé en lien de téléchargement.
 */
export function signedFileUrl(fileId: string, opts: { ttlSeconds?: number; download?: boolean } = {}) {
  const exp = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 3600);
  const sig = hmacHex(env.fileSigningSecret, `${fileId}.${exp}${opts.download ? ".dl" : ""}`);
  return `/api/files/${fileId}?exp=${exp}&sig=${sig}${opts.download ? "&dl=1" : ""}`;
}

export function verifyFileSignature(fileId: string, exp: string | null, sig: string | null, download = false): boolean {
  if (!exp || !sig) return false;
  const expN = Number(exp);
  if (!Number.isFinite(expN) || expN < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(hmacHex(env.fileSigningSecret, `${fileId}.${expN}${download ? ".dl" : ""}`), sig);
}

export function publicFileUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/api/files/${fileId}` : null;
}
