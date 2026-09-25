import "server-only";
import { randomBytes } from "node:crypto";
import type { OrderItemType, PaymentMode } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { notify } from "../notify";
import { formatXof } from "../format";
import { getPaymentSettings } from "../settings";
import { applyCoupon, planDurationDays, roundXof } from "./pricing";
import { getProvider } from "./registry";

export class CheckoutError extends Error {}

export function orderReference() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `NGA${d}${randomBytes(4).toString("hex").toUpperCase()}`;
}

type Item = { type: OrderItemType; id: string };

/** Prix calculé exclusivement côté serveur à partir de la base (jamais depuis le navigateur). */
export async function priceItem(item: Item) {
  if (item.type === "COURSE") {
    const c = await prisma.course.findFirst({ where: { id: item.id, status: "PUBLISHED" } });
    if (!c) throw new CheckoutError("Formation indisponible.");
    return { label: `Formation : ${c.title}`, subtotal: c.isFree ? 0 : c.priceXof, courseId: c.id };
  }
  if (item.type === "PACK") {
    const p = await prisma.pack.findFirst({ where: { id: item.id, active: true } });
    if (!p) throw new CheckoutError("Pack indisponible.");
    return { label: `Pack : ${p.title}`, subtotal: p.priceXof, courseId: null };
  }
  const plan = await prisma.plan.findFirst({ where: { id: item.id, active: true } });
  if (!plan) throw new CheckoutError("Abonnement indisponible.");
  return { label: `Abonnement : ${plan.name}`, subtotal: plan.priceXof, courseId: null };
}

export async function quote(userId: string, item: Item, couponCode?: string | null) {
  const priced = await priceItem(item);
  let discount = 0;
  let couponId: string | null = null;
  let couponError: string | null = null;
  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode.trim().toUpperCase() } });
    if (!coupon) couponError = "Code promotionnel inconnu.";
    else {
      const userUses = await prisma.order.count({ where: { userId, couponId: coupon.id, status: "PAID" } });
      const r = applyCoupon(coupon, { subtotal: priced.subtotal, courseId: priced.courseId, userUses, perUserLimit: coupon.perUserLimit });
      if (r.ok) {
        discount = r.discount;
        couponId = coupon.id;
      } else couponError = r.error;
    }
  }
  const total = roundXof(priced.subtotal - discount);
  return { ...priced, discount: priced.subtotal - total, total, couponId, couponError };
}

export async function startCheckout(opts: {
  user: { id: string; name: string; email: string; phone: string | null };
  item: Item;
  couponCode?: string | null;
  providerId: string;
}) {
  const q = await quote(opts.user.id, opts.item, opts.couponCode);
  if (q.couponError && opts.couponCode) throw new CheckoutError(q.couponError);

  if (opts.item.type === "COURSE") {
    const enr = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: opts.user.id, courseId: opts.item.id } } });
    if (enr?.status === "ACTIVE") throw new CheckoutError("Vous avez déjà accès à cette formation.");
  }

  const reference = orderReference();
  const base = {
    reference,
    userId: opts.user.id,
    itemType: opts.item.type,
    courseId: opts.item.type === "COURSE" ? opts.item.id : null,
    packId: opts.item.type === "PACK" ? opts.item.id : null,
    planId: opts.item.type === "PLAN" ? opts.item.id : null,
    itemLabel: q.label,
    subtotalXof: q.subtotal,
    discountXof: q.discount,
    totalXof: q.total,
    couponId: q.couponId,
  };

  // Montant nul (formation gratuite ou coupon à 100 %) : pas de paiement nécessaire.
  if (q.total === 0) {
    const order = await prisma.order.create({ data: { ...base, provider: "none", mode: "LIVE" } });
    await fulfillOrder(order.id, { mode: "LIVE" });
    return { redirectUrl: `/paiement/${reference}` };
  }

  const provider = getProvider(opts.providerId);
  if (!provider) throw new CheckoutError("Moyen de paiement inconnu.");
  const settings = await getPaymentSettings();
  if (provider.id !== "demo" && !settings.enabled.includes(provider.id)) throw new CheckoutError("Ce moyen de paiement n'est pas activé.");
  if (!(await provider.isConfigured())) throw new CheckoutError("Ce moyen de paiement n'est pas configuré.");

  const mode: PaymentMode =
    provider.id === "demo" ? "DEMO" : provider.id === "paydunya" && settings.paydunyaMode === "test" ? "SANDBOX" : "LIVE";
  const order = await prisma.order.create({ data: { ...base, provider: provider.id, mode } });
  try {
    const res = await provider.initiate({
      reference,
      amount: q.total,
      description: q.label,
      customer: { name: opts.user.name, email: opts.user.email, phone: opts.user.phone },
      returnUrl: `${env.appUrl}/paiement/${reference}`,
      cancelUrl: `${env.appUrl}/paiement/${reference}?annule=1`,
      notifyUrl: `${env.appUrl}/api/payments/webhook/${provider.id}`,
    });
    await prisma.order.update({ where: { id: order.id }, data: { providerRef: res.providerRef ?? null } });
    await prisma.paymentEvent.create({ data: { orderId: order.id, provider: provider.id, kind: "initiate", payload: { ok: true } } });
    return { redirectUrl: res.redirectUrl };
  } catch (e) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED", failureReason: (e as Error).message.slice(0, 300) } });
    await prisma.paymentEvent.create({ data: { orderId: order.id, provider: provider.id, kind: "error", payload: { message: (e as Error).message.slice(0, 300) } } });
    throw new CheckoutError("Le prestataire de paiement n'a pas pu initialiser la transaction. Réessayez ou choisissez un autre moyen.");
  }
}

/**
 * Vérifie une commande auprès du prestataire (webhook reçu, retour utilisateur, tâche planifiée).
 * La redirection vers la page de succès n'est JAMAIS considérée comme une preuve de paiement.
 */
export async function verifyOrder(reference: string, source: string) {
  const order = await prisma.order.findUnique({ where: { reference } });
  if (!order || order.status !== "PENDING" || !order.provider) return order;
  const provider = getProvider(order.provider);
  if (!provider || provider.id === "demo") return order;
  let res;
  try {
    res = await provider.verify({ reference: order.reference, providerRef: order.providerRef });
  } catch (e) {
    await prisma.paymentEvent.create({ data: { orderId: order.id, provider: provider.id, kind: "error", payload: { source, message: (e as Error).message.slice(0, 300) } } });
    return order;
  }
  await prisma.paymentEvent.create({
    data: { orderId: order.id, provider: provider.id, kind: "verify", verified: res.status === "PAID", payload: { source, status: res.status, amount: res.amount ?? null, currency: res.currency ?? null } },
  });
  if (res.status === "PAID") {
    const amountOk = res.amount === undefined || res.amount >= order.totalXof;
    const currencyOk = !res.currency || res.currency.toUpperCase() === "XOF";
    if (!amountOk || !currencyOk) {
      await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED", failureReason: "Montant ou devise incohérents : vérification manuelle requise." } });
      return prisma.order.findUnique({ where: { id: order.id } });
    }
    await fulfillOrder(order.id, { mode: order.mode, providerRef: res.providerRef });
  } else if (res.status === "FAILED") {
    await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "FAILED", failureReason: "Paiement refusé ou annulé." } });
  }
  return prisma.order.findUnique({ where: { id: order.id } });
}

async function nextInvoiceNumber(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], demo: boolean) {
  const year = new Date().getFullYear();
  const prefix = demo ? `DEMO-${year}-` : `FAC-${year}-`;
  const count = await tx.invoice.count({ where: { number: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

/** Attribution des droits d'accès après confirmation réelle — idempotente. */
export async function fulfillOrder(orderId: string, opts: { mode: PaymentMode; providerRef?: string }) {
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date(), ...(opts.providerRef ? { providerRef: opts.providerRef } : {}) },
    });
    if (claimed.count === 0) return null;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { pack: { include: { courses: true } }, plan: true } });

    const grant = async (courseId: string, source: "PURCHASE" | "PACK" | "SUBSCRIPTION") => {
      await tx.enrollment.upsert({
        where: { userId_courseId: { userId: order.userId, courseId } },
        create: { userId: order.userId, courseId, source, orderId: order.id },
        update: { status: "ACTIVE", source, orderId: order.id },
      });
    };
    if (order.itemType === "COURSE" && order.courseId) await grant(order.courseId, "PURCHASE");
    if (order.itemType === "PACK" && order.pack) for (const pc of order.pack.courses) await grant(pc.courseId, "PACK");
    if (order.itemType === "PLAN" && order.plan) {
      const current = await tx.subscription.findFirst({
        where: { userId: order.userId, status: "ACTIVE", endsAt: { gt: new Date() } },
        orderBy: { endsAt: "desc" },
      });
      const startsAt = current ? current.endsAt : new Date();
      const endsAt = new Date(startsAt.getTime() + planDurationDays(order.plan.interval) * 24 * 3600 * 1000);
      await tx.subscription.create({ data: { userId: order.userId, planId: order.plan.id, startsAt, endsAt, orderId: order.id } });
    }
    if (order.couponId) await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
    await tx.invoice.create({ data: { orderId: order.id, number: await nextInvoiceNumber(tx, order.mode === "DEMO") } });
    return order;
  });
  if (!done) return;
  await notify(done.userId, {
    type: "PAYMENT",
    title: done.totalXof > 0 ? "Paiement confirmé" : "Accès activé",
    body:
      done.totalXof > 0
        ? `Votre paiement de ${formatXof(done.totalXof)} pour « ${done.itemLabel} » a été confirmé. Bonne formation !`
        : `Votre accès à « ${done.itemLabel} » est activé. Bonne formation !`,
    link: done.itemType === "PLAN" ? "/espace/paiements" : "/espace/formations",
    email: true,
  });
}
