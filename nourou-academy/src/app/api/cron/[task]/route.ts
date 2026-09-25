import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { flushOutbox } from "@/lib/mail";
import { notify } from "@/lib/notify";
import { verifyOrder } from "@/lib/payments/checkout";
import { formatDateTime } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tâches planifiées, à appeler par un planificateur (cron système, GitHub Actions, service cron) :
 *   POST /api/cron/all   avec l'en-tête  Authorization: Bearer <CRON_SECRET>
 * Tâches : outbox (emails), reminders (rappels de classes), payments (réconciliation), subscriptions (expirations).
 */
export async function POST(req: Request, ctx: { params: Promise<{ task: string }> }) {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.cronSecret || !safeEqual(auth, `Bearer ${env.cronSecret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { task } = await ctx.params;
  const result: Record<string, number> = {};

  if (task === "outbox" || task === "all") result.emails = await flushOutbox(100);

  if (task === "reminders" || task === "all") {
    const soon = await prisma.liveSession.findMany({
      where: { status: "SCHEDULED", reminderSentAt: null, startsAt: { gt: new Date(), lte: new Date(Date.now() + 70 * 60_000) } },
      include: { registrations: { select: { userId: true } } },
    });
    for (const s of soon) {
      for (const r of s.registrations) {
        await notify(r.userId, { type: "LIVE", title: "Votre classe commence bientôt", body: `« ${s.title} » débute à ${formatDateTime(s.startsAt)}. La salle ouvre 15 minutes avant.`, link: `/espace/classe/${s.id}`, email: true });
      }
      await prisma.liveSession.update({ where: { id: s.id }, data: { reminderSentAt: new Date() } });
    }
    result.reminders = soon.length;
    // Clôture automatique des séances terminées depuis plus de 2 heures.
    const ended = await prisma.$executeRaw`UPDATE "LiveSession" SET status = 'ENDED' WHERE status IN ('SCHEDULED','LIVE') AND "startsAt" + ("durationMinutes" || ' minutes')::interval < now() - interval '2 hours'`;
    result.livesClosed = ended;
  }

  if (task === "payments" || task === "all") {
    // Réconciliation : commandes en attente depuis 5 minutes à 48 heures, interrogées auprès du prestataire.
    const pending = await prisma.order.findMany({
      where: { status: "PENDING", provider: { notIn: ["demo", "none"] }, createdAt: { lt: new Date(Date.now() - 5 * 60_000), gt: new Date(Date.now() - 48 * 3600_000) } },
      select: { reference: true },
      take: 50,
    });
    for (const o of pending) await verifyOrder(o.reference, "cron");
    const expired = await prisma.order.updateMany({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 48 * 3600_000) } }, data: { status: "CANCELED", failureReason: "Expirée sans confirmation du prestataire" } });
    result.paymentsChecked = pending.length;
    result.paymentsExpired = expired.count;
  }

  if (task === "subscriptions" || task === "all") {
    const expiring = await prisma.subscription.findMany({ where: { status: "ACTIVE", endsAt: { lt: new Date() } }, select: { id: true, userId: true } });
    for (const s of expiring) {
      await prisma.subscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
      const stillActive = await prisma.subscription.findFirst({ where: { userId: s.userId, status: "ACTIVE", endsAt: { gt: new Date() } } });
      if (!stillActive) {
        await notify(s.userId, { type: "SUBSCRIPTION", title: "Votre abonnement a expiré", body: "Renouvelez-le pour continuer à accéder aux formations incluses. Vos formations achetées restent accessibles.", link: "/tarifs", email: true });
      }
    }
    result.subscriptionsExpired = expiring.length;
  }

  return NextResponse.json({ ok: true, task, result });
}
