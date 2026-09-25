import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { certificatePdf } from "@/lib/certificates/pdf";

/** PDF du certificat : public si valide (vérifiable via QR code), sinon réservé au titulaire et à l'équipe. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  const cert = await prisma.certificate.findUnique({ where: { code } });
  if (!cert) return jsonError(404, "Certificat introuvable.");
  if (cert.status !== "VALID") {
    const user = await getCurrentUser();
    if (!user || (user.id !== cert.userId && !["SUPERADMIN", "ADMIN"].includes(user.role))) return jsonError(404, "Certificat introuvable.");
  }
  const pdf = await certificatePdf(cert);
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="certificat-${cert.code}.pdf"`, "Cache-Control": "private, max-age=300" } });
});
