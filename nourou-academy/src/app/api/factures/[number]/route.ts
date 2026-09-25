import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { handle, jsonError } from "@/lib/api";
import { invoicePdf } from "@/lib/payments/invoice-pdf";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ number: string }> }) => {
  const user = await assertUser();
  const { number } = await ctx.params;
  const inv = await prisma.invoice.findUnique({ where: { number }, include: { order: { include: { user: { select: { name: true, email: true, phone: true } } } } } });
  if (!inv || (inv.order.userId !== user.id && !can(user.role, "finance.view"))) return jsonError(404, "Facture introuvable.");
  const pdf = await invoicePdf(inv);
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.number}.pdf"`, "Cache-Control": "private, no-store" } });
});
