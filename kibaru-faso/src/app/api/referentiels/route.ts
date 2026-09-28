import { hasAccess } from "@/lib/access";
import { getLibrary } from "@/lib/library";
import { aiConfig } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liste de la bibliothèque de référence (sans le texte) et état de la configuration. */
export async function GET(req: Request) {
  if (!hasAccess(req)) return Response.json({ error: "Code d'accès requis." }, { status: 401 });
  const docs = await getLibrary().catch(() => []);
  return Response.json({
    configured: aiConfig().configured,
    documents: docs.map((d) => ({ id: d.id, title: d.title, type: d.type, classes: d.classes, disciplines: d.disciplines, source: d.source ?? null })),
  });
}
