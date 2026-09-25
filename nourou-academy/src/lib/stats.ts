import "server-only";
import { prisma } from "./db";

/** Chiffre d'affaires mensuel réel (commandes payées, hors démonstration et remboursements). */
export async function monthlyRevenue(months = 12) {
  const rows = await prisma.$queryRaw<{ month: Date; total: bigint; count: bigint }[]>`
    SELECT date_trunc('month', "paidAt") AS month, SUM("totalXof")::bigint AS total, COUNT(*)::bigint AS count
    FROM "Order"
    WHERE status = 'PAID' AND mode = 'LIVE' AND "paidAt" >= date_trunc('month', now()) - (${months - 1} || ' months')::interval
    GROUP BY 1 ORDER BY 1`;
  const out: { label: string; total: number; count: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const r = rows.find((x) => x.month.getUTCFullYear() === d.getUTCFullYear() && x.month.getUTCMonth() === d.getUTCMonth());
    out.push({ label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }), total: Number(r?.total ?? 0), count: Number(r?.count ?? 0) });
  }
  return out;
}
