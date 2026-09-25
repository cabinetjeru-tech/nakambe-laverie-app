import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { audit } from "@/lib/audit";

function csv(rows: (string | number | null | undefined)[][]) {
  return "﻿" + rows.map((r) => r.map((v) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // protection contre l'injection de formules
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }).join(";")).join("\r\n");
}

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ kind: string }> }) => {
  const { kind } = await ctx.params;
  if (kind === "transactions") {
    const admin = await assertPermission("finance.view");
    const orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 20000, include: { user: { select: { email: true } }, invoice: true } });
    await audit(admin.id, "export.transactions", "Order", null, { count: orders.length });
    const body = csv([["Référence", "Date", "Client", "Article", "Sous-total", "Remise", "Total", "Statut", "Mode", "Prestataire", "Réf. prestataire", "Payé le", "Facture"],
      ...orders.map((o) => [o.reference, o.createdAt.toISOString(), o.user.email, o.itemLabel, o.subtotalXof, o.discountXof, o.totalXof, o.status, o.mode, o.provider, o.providerRef, o.paidAt?.toISOString(), o.invoice?.number])]);
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  if (kind === "apprenants") {
    const admin = await assertPermission("reports.view");
    const rows = await prisma.enrollment.findMany({ take: 50000, include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } } });
    await audit(admin.id, "export.learners", "Enrollment", null, { count: rows.length });
    const body = csv([["Apprenant", "Email", "Formation", "Source", "Statut", "Progression", "Inscrit le", "Terminé le"], ...rows.map((e) => [e.user.name, e.user.email, e.course.title, e.source, e.status, e.progressPercent, e.createdAt.toISOString(), e.completedAt?.toISOString()])]);
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inscriptions-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  return jsonError(404, "Export inconnu.");
});
