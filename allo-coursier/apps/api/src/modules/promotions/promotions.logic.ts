import { Promotion, PromotionType } from '@prisma/client';

/** Montant de la remise d'une promotion sur des frais de livraison (jamais plus que les frais). */
export function computeDiscount(promo: Pick<Promotion, 'type' | 'value' | 'maxDiscount'>, deliveryFee: number): number {
  let discount: number;
  switch (promo.type) {
    case PromotionType.PERCENT:
      discount = Math.round((deliveryFee * promo.value) / 100);
      break;
    case PromotionType.FIXED:
      discount = promo.value;
      break;
    case PromotionType.FREE_DELIVERY:
      discount = deliveryFee;
      break;
  }
  if (promo.maxDiscount != null) discount = Math.min(discount, promo.maxDiscount);
  return Math.max(0, Math.min(discount, deliveryFee));
}
