import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { localStream, readFileBuffer, s3PresignedUrl, verifyFileSignature } from "@/lib/storage";

export const runtime = "nodejs";

function srtToVtt(srt: string) {
  return "WEBVTT\n\n" + srt.replace(/\r/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
}

/**
 * Service des fichiers :
 *  - PUBLIC  : images de couverture, avatars… accessibles librement ;
 *  - PRIVATE : uniquement avec une URL signée à durée limitée, générée côté serveur
 *    après vérification des droits (leçons, devoirs), ou par le propriétaire / l'équipe.
 * Prend en charge les requêtes partielles (Range) : lecture vidéo progressive et reprise
 * des téléchargements interrompus.
 */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) return jsonError(404, "Fichier introuvable.");

  if (file.visibility === "PRIVATE") {
    const signed = verifyFileSignature(id, url.searchParams.get("exp"), url.searchParams.get("sig"));
    if (!signed) {
      const user = await getCurrentUser();
      const staff = user && ["SUPERADMIN", "ADMIN", "ASSISTANT"].includes(user.role);
      if (!user || (!staff && file.ownerId !== user.id)) return jsonError(403, "Lien expiré ou accès refusé.");
    }
  }

  const download = url.searchParams.get("dl") === "1";
  const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`;
  const cache = file.visibility === "PUBLIC" ? "public, max-age=86400" : "private, max-age=3600";

  if (url.searchParams.get("format") === "vtt" && (file.mimeType === "application/x-subrip" || file.mimeType === "text/vtt")) {
    const text = (await readFileBuffer(file)).toString("utf8");
    return new Response(file.mimeType === "text/vtt" ? text : srtToVtt(text), { headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": cache } });
  }

  if (file.driver === "s3") {
    return Response.redirect(await s3PresignedUrl(file.key, file.originalName, download, 3600), 302);
  }

  const range = req.headers.get("range");
  const baseHeaders: Record<string, string> = {
    "Content-Type": file.mimeType,
    "Content-Disposition": disposition,
    "Accept-Ranges": "bytes",
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
  };
  // Les documents non média ne doivent jamais être interprétés comme du HTML par le navigateur.
  if (!/^(image|video|audio)\//.test(file.mimeType) && file.mimeType !== "application/pdf") baseHeaders["Content-Security-Policy"] = "sandbox";

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const size = file.size;
    let start = m?.[1] ? Number(m[1]) : NaN;
    let end = m?.[2] ? Number(m[2]) : NaN;
    if (Number.isNaN(start)) {
      start = size - (Number.isNaN(end) ? 0 : end);
      end = size - 1;
    }
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end || start < 0) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const { stream } = await localStream(file.key, { start, end });
    return new Response(stream, { status: 206, headers: { ...baseHeaders, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const { stream, size } = await localStream(file.key);
  return new Response(stream, { headers: { ...baseHeaders, "Content-Length": String(size) } });
});
