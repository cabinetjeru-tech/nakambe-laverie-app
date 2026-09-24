import { BillingCycle } from '@prisma/client';

export const DAY_MS = 24 * 3600 * 1000;

/** Fin d'une période de facturation (mois ou année civils, jour conservé si possible). */
export function addCycle(start: Date, cycle: BillingCycle): Date {
  const end = new Date(start);
  const day = end.getUTCDate();
  if (cycle === 'YEARLY') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  // 31 janvier + 1 mois → dernier jour de février, pas 3 mars.
  if (end.getUTCDate() !== day) end.setUTCDate(0);
  return end;
}

export function priceFor(plan: { priceMonthly: bigint; priceYearly: bigint }, cycle: BillingCycle): bigint {
  return cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
}

/** Prix mensuel équivalent, pour comparer deux offres de cycles différents. */
export function monthlyEquivalent(plan: { priceMonthly: bigint; priceYearly: bigint }, cycle: BillingCycle): bigint {
  return cycle === 'YEARLY' ? plan.priceYearly / 12n : plan.priceMonthly;
}

/**
 * Montant dû au prorata du temps restant dans la période, arrondi à la dizaine supérieure.
 * Plafonné à la période entière : une période payée d'avance, pas encore commencée, est due
 * en totalité (les jours restants de la période en cours sont offerts).
 */
export function prorata(amount: bigint, now: Date, periodStart: Date, periodEnd: Date): bigint {
  const total = periodEnd.getTime() - periodStart.getTime();
  const remaining = Math.min(total, Math.max(0, periodEnd.getTime() - now.getTime()));
  if (total <= 0 || amount <= 0n) return 0n;
  const raw = (amount * BigInt(Math.round((remaining / total) * 1_000_000))) / 1_000_000n;
  return ((raw + 9n) / 10n) * 10n;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}
