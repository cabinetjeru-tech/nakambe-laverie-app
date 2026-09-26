/**
 * Répartition de l'argent d'une livraison terminée — fonction pure.
 *
 *  net client (livraison) = frais de livraison + attente − remise
 *  indépendant : gain = frais + attente − commission(taux) ; la remise est à la charge de la plateforme
 *  salarié     : gain = 0 ; tout le net revient à l'entreprise (il est payé par salaire)
 *
 *  Espèces : le livreur a encaissé le net client ; il doit à la plateforme (net − gain).
 *  Prépayé (portefeuille, Mobile Money) : la plateforme détient déjà le net ; elle crédite le gain au livreur.
 */
export interface SettlementInput {
  deliveryFee: number;
  waitingFee: number;
  discountAmount: number;
  commissionPercent: number;
  employmentType: 'SALARIE' | 'INDEPENDANT';
  paymentMethod: string;
}

export interface Settlement {
  clientDeliveryTotal: number;
  commissionAmount: number;
  driverEarning: number;
  /** Mouvement du portefeuille livreur (positif = la plateforme lui doit plus). */
  driverWalletDelta: number;
  platformWalletDelta: number;
}

export function computeSettlement(input: SettlementInput): Settlement {
  const gross = input.deliveryFee + input.waitingFee;
  const clientDeliveryTotal = Math.max(0, gross - input.discountAmount);
  const driverEarning =
    input.employmentType === 'SALARIE' ? 0 : gross - Math.round((gross * input.commissionPercent) / 100);
  const commissionAmount = clientDeliveryTotal - driverEarning;
  const driverWalletDelta = input.paymentMethod === 'CASH' ? -commissionAmount : driverEarning;
  return {
    clientDeliveryTotal,
    commissionAmount,
    driverEarning,
    driverWalletDelta,
    platformWalletDelta: 0 - driverWalletDelta || 0,
  };
}
