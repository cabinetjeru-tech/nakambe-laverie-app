import { hasAccess } from "@/lib/access";
import { detectKind, extractText } from "@/lib/extract";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // limite de corps des fonctions Vercel : 4,5 Mo

/** Extrait le texte d'un document de l'enseignant. Le fichier n'est pas conservé sur le serveur. */
export async function POST(req: Request) {
  if (!hasAccess(req)) return Response.json({ error: "Code d'accès requis." }, { status: 401 });
  const rl = rateLimit(`extract:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return Response.json({ error: `Trop de fichiers envoyés. Réessayez dans ${rl.retryAfter} s.` }, { status: 429 });
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return Response.json({ error: "Fichier manquant." }, { status: 400 });
  }
  const file = fd.get("file");
  if (!file || typeof file === "string" || file.size === 0) return Response.json({ error: "Fichier manquant." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Fichier trop volumineux (4 Mo au maximum)." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = detectKind(buf, file.name);
  if (!kind) return Response.json({ error: "Format non pris en charge. Utilisez un PDF, un document Word (.docx) ou un fichier texte." }, { status: 415 });
  try {
    const text = (await extractText(buf, kind)).replace(/\u0000/g, "").trim();
    if (!text) return Response.json({ error: "Aucun texte n'a pu être lu dans ce fichier (document scanné ?). Essayez une version texte." }, { status: 422 });
    return Response.json({ text: text.slice(0, 600_000), truncated: text.length > 600_000 });
  } catch (e) {
    console.error("[extract]", (e as Error).message);
    return Response.json({ error: "Lecture du fichier impossible." }, { status: 422 });
  }
}
