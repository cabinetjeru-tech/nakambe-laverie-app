import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/payments/registry";
import { verifyOrder } from "@/lib/payments/checkout";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notifications serveur-à-serveur des prestataires (webhook / IPN).
 * 1. authentification de la notification (signature HMAC / hash) ;
 * 2. la notification ne fait que DÉCLENCHER une vérification : le statut réel est
 *    obtenu en interrogeant l'API du prestataire (montant, devise, référence contrôlés).
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await ctx.params;
  const provider = getProvider(id);
  if (!provider || id === "demo") return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`webhook:${id}:${ip}`, 120, 60_000).ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  const rawBody = await req.text();
  if (rawBody.length > 100_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  let parsed: Awaited<ReturnType<typeof provider.parseWebhook>> = null;
  try {
    parsed = await provider.parseWebhook({ headers: req.headers, rawBody });
  } catch {
    parsed = null;
  }
  if (!parsed?.reference) {
    await prisma.paymentEvent.create({ data: { provider: id, kind: "webhook-rejected", verified: false, payload: { ip, reason: "signature invalide ou référence absente" } } });
    return NextResponse.json({ error: "invalid notification" }, { status: 400 });
  }
  const order = await prisma.order.findUnique({ where: { reference: parsed.reference } });
  if (!order || order.provider !== id) return NextResponse.json({ error: "unknown order" }, { status: 404 });
  if (parsed.providerRef && !order.providerRef) await prisma.order.update({ where: { id: order.id }, data: { providerRef: parsed.providerRef } });
  await prisma.paymentEvent.create({ data: { orderId: order.id, provider: id, kind: "webhook", verified: parsed.signatureChecked, payload: { ip, signatureChecked: parsed.signatureChecked } } });
  await verifyOrder(order.reference, "webhook");
  return NextResponse.json({ received: true });
}

// Certains prestataires testent l'URL de notification en GET.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
