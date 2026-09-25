/**
 * Calcul du prix avec coupon — fonction pure (testée dans tests/pricing.test.ts).
 */
export type CouponLike = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  active: boolean;
  maxUses: number | null;
  usedCount: number;
  minAmountXof: number;
  courseId: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
};

export type CouponCheck = { ok: true; discount: number } | { ok: false; error: string };

export function applyCoupon(
  coupon: CouponLike,
  ctx: { subtotal: number; courseId: string | null; userUses: number; perUserLimit: number; now?: Date },
): CouponCheck {
  const now = ctx.now ?? new Date();
  if (!coupon.active) return { ok: false, error: "Ce code n'est plus actif." };
  if (coupon.validFrom && now < coupon.validFrom) return { ok: false, error: "Ce code n'est pas encore valable." };
  if (coupon.validUntil && now > coupon.validUntil) return { ok: false, error: "Ce code a expiré." };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { ok: false, error: "Ce code a atteint son nombre maximal d'utilisations." };
  if (ctx.perUserLimit > 0 && ctx.userUses >= ctx.perUserLimit) return { ok: false, error: "Vous avez déjà utilisé ce code." };
  if (coupon.courseId && coupon.courseId !== ctx.courseId) return { ok: false, error: "Ce code ne s'applique pas à cet achat." };
  if (ctx.subtotal < coupon.minAmountXof) return { ok: false, error: `Montant minimum : ${coupon.minAmountXof} FCFA.` };
  const raw = coupon.type === "PERCENT" ? Math.round((ctx.subtotal * Math.min(100, Math.max(0, coupon.value))) / 100) : coupon.value;
  const discount = Math.max(0, Math.min(ctx.subtotal, raw));
  return { ok: true, discount };
}

/** Les agrégateurs exigent souvent un montant multiple de 5 en XOF. */
export function roundXof(amount: number) {
  return Math.max(0, Math.round(amount / 5) * 5);
}

export function planDurationDays(interval: "MONTH" | "QUARTER" | "YEAR") {
  return interval === "MONTH" ? 30 : interval === "QUARTER" ? 91 : 365;
}
