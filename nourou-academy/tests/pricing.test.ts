import { describe, expect, it } from "vitest";
import { applyCoupon, roundXof, type CouponLike } from "@/lib/payments/pricing";

const base: CouponLike = { code: "X", type: "PERCENT", value: 10, active: true, maxUses: null, usedCount: 0, minAmountXof: 0, courseId: null, validFrom: null, validUntil: null };
const ctx = { subtotal: 25000, courseId: "c1", userUses: 0, perUserLimit: 1 };

describe("coupons et prix", () => {
  it("pourcentage", () => expect(applyCoupon(base, ctx)).toEqual({ ok: true, discount: 2500 }));
  it("montant fixe plafonné au prix", () => expect(applyCoupon({ ...base, type: "FIXED", value: 99999 }, ctx)).toEqual({ ok: true, discount: 25000 }));
  it("expiré", () => expect(applyCoupon({ ...base, validUntil: new Date("2020-01-01") }, ctx).ok).toBe(false));
  it("limite d'utilisations", () => expect(applyCoupon({ ...base, maxUses: 5, usedCount: 5 }, ctx).ok).toBe(false));
  it("limite par utilisateur", () => expect(applyCoupon(base, { ...ctx, userUses: 1 }).ok).toBe(false));
  it("restreint à une formation", () => expect(applyCoupon({ ...base, courseId: "autre" }, ctx).ok).toBe(false));
  it("montant minimum", () => expect(applyCoupon({ ...base, minAmountXof: 30000 }, ctx).ok).toBe(false));
  it("arrondi XOF au multiple de 5", () => {
    expect(roundXof(22502)).toBe(22500);
    expect(roundXof(-10)).toBe(0);
  });
});
