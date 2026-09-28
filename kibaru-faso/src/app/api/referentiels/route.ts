import { connecte } from "@/lib/garde";
import { categoryLabel } from "@/lib/base/structure";
import { getBase } from "@/lib/library";
import { aiConfig } from "@/lib/llm";
import { resolveBase, type DocInfo } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summary(d: DocInfo) {
  return {
    id: d.id,
    documentId: d.documentId ?? null,
    title: d.title,
    type: d.type,
    category: d.category ?? null,
    categoryLabel: categoryLabel(d.category),
    classes: d.classes,
    disciplines: d.disciplines,
    source: d.source ?? null,
    organisme: d.organisme ?? null,
    year: d.year ?? null,
    version: d.version ?? null,
    sourceLevel: d.sourceLevel ?? null,
    priority: d.priority ?? null,
    url: d.url ?? null,
    perimeter: d.perimeter ?? null,
    statut: d.statut ?? null,
    observations: d.observations ?? null,
    notice: d.notice ?? null,
    note: d.note ?? null,
    verifiedAt: d.verifiedAt ?? null,
  };
}

/** Base documentaire PÉDAGOGUE.IA (sans le texte) : ressources consultées, historique des versions, fiches en attente. */
export async function GET(req: Request) {
  if (!(await connecte(req))) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const base = await getBase().catch(() => ({ docs: [], pending: [], issues: [] }));
  const { usable, history } = resolveBase(base.docs);
  return Response.json({
    configured: aiConfig().configured,
    documents: usable.map(summary),
    history: history.map((h) => ({ ...summary(h.doc), reason: h.reason })),
    pending: base.pending.map((p) => ({ ...p, categoryLabel: categoryLabel(p.category) })),
  });
}
