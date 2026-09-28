import { hasAccess } from "@/lib/access";
import { getLibrary } from "@/lib/library";
import { aiConfig } from "@/lib/llm";
import { partitionByLifecycle, type DocInfo } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summary(d: DocInfo) {
  return {
    id: d.id,
    documentId: d.documentId ?? null,
    title: d.title,
    type: d.type,
    classes: d.classes,
    disciplines: d.disciplines,
    source: d.source ?? null,
    organisme: d.organisme ?? null,
    year: d.year ?? null,
    version: d.version ?? null,
    reliability: d.reliability ?? null,
    status: d.status ?? null,
    notice: d.notice ?? null,
    updatedAt: d.updatedAt ?? null,
  };
}

/** Base documentaire KIBARU (sans le texte) : documents actifs, archives, et état de la configuration. */
export async function GET(req: Request) {
  if (!hasAccess(req)) return Response.json({ error: "Code d'accès requis." }, { status: 401 });
  const docs = await getLibrary().catch(() => []);
  const { active, archived } = partitionByLifecycle(docs);
  return Response.json({
    configured: aiConfig().configured,
    documents: active.map(summary),
    archives: archived.map((a) => ({ ...summary(a.doc), reason: a.reason })),
  });
}
