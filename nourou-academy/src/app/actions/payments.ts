"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { CheckoutError, fulfillOrder, startCheckout } from "@/lib/payments/checkout";
import { formString, type ActionState } from "@/lib/validation";

const schema = z.object({ type: z.enum(["COURSE", "PACK", "PLAN"]), id: z.string().min(1).max(40), coupon: z.string().max(40).optional(), provider: z.string().max(20) });

export async function checkoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!rateLimit(`checkout:${user.id}`, 10, 10 * 60_000).ok) return { error: "Trop de tentatives de paiement. Patientez quelques minutes." };
  const parsed = schema.safeParse({ type: formString(fd, "type"), id: formString(fd, "id"), coupon: formString(fd, "coupon") || undefined, provider: formString(fd, "provider") || "none" });
  if (!parsed.success) return { error: "Requête invalide." };
  let target: string;
  try {
    const res = await startCheckout({
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
      item: { type: parsed.data.type, id: parsed.data.id },
      couponCode: parsed.data.coupon,
      providerId: parsed.data.provider,
    });
    target = res.redirectUrl;
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    console.error("[checkout]", (e as Error).message);
    return { error: "Une erreur est survenue. Réessayez." };
  }
  redirect(target);
}

/** Confirmation d'une commande de DÉMONSTRATION (jamais disponible en production). */
export async function confirmDemoAction(reference: string, outcome: "success" | "failure") {
  const user = await requireUser();
  if (!env.paymentDemoEnabled) redirect(`/paiement/${reference}`);
  const order = await prisma.order.findFirst({ where: { reference, userId: user.id, provider: "demo", mode: "DEMO", status: "PENDING" } });
  if (order) {
    if (outcome === "success") {
      await prisma.paymentEvent.create({ data: { orderId: order.id, provider: "demo", kind: "demo-confirm", verified: false, payload: { outcome } } });
      await fulfillOrder(order.id, { mode: "DEMO" });
    } else {
      await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED", failureReason: "Échec simulé (démonstration)" } });
    }
  }
  redirect(`/paiement/${reference}`);
}
