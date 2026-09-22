import { computeSettlement } from './money-flows';

describe('computeSettlement', () => {
  const base = { deliveryFee: 1350, waitingFee: 0, discountAmount: 0, commissionPercent: 20 };

  it('indépendant, espèces : le livreur garde son gain et doit la commission', () => {
    const s = computeSettlement({ ...base, employmentType: 'INDEPENDANT', paymentMethod: 'CASH' });
    expect(s).toMatchObject({ commissionAmount: 270, driverEarning: 1080, driverWalletDelta: -270, platformWalletDelta: 270 });
  });

  it('indépendant, prépayé : la plateforme reverse le gain au livreur', () => {
    const s = computeSettlement({ ...base, employmentType: 'INDEPENDANT', paymentMethod: 'WALLET' });
    expect(s).toMatchObject({ driverWalletDelta: 1080, platformWalletDelta: -1080 });
  });

  it('salarié, espèces : tout l’encaissement revient à l’entreprise', () => {
    const s = computeSettlement({ ...base, employmentType: 'SALARIE', paymentMethod: 'CASH' });
    expect(s).toMatchObject({ commissionAmount: 1350, driverEarning: 0, driverWalletDelta: -1350, platformWalletDelta: 1350 });
  });

  it('salarié, prépayé : aucun mouvement vers le livreur', () => {
    const s = computeSettlement({ ...base, employmentType: 'SALARIE', paymentMethod: 'MANUAL_MOBILE_MONEY' });
    expect(s).toMatchObject({ driverWalletDelta: 0, platformWalletDelta: 0 });
  });

  it('promotion financée par la plateforme : le gain du livreur est intact', () => {
    const s = computeSettlement({ ...base, discountAmount: 1350, employmentType: 'INDEPENDANT', paymentMethod: 'CASH' });
    // Livraison offerte : le livreur n'encaisse rien et la plateforme lui doit son gain.
    expect(s).toMatchObject({ driverEarning: 1080, commissionAmount: -1080, driverWalletDelta: 1080, platformWalletDelta: -1080 });
  });

  it('frais d’attente ajoutés en espèces', () => {
    const s = computeSettlement({ ...base, waitingFee: 150, employmentType: 'INDEPENDANT', paymentMethod: 'CASH' });
    expect(s.clientDeliveryTotal).toBe(1500);
    expect(s.commissionAmount + s.driverEarning).toBe(1500);
  });

  it('la somme gain + commission égale toujours le net payé par le client', () => {
    for (const employmentType of ['INDEPENDANT', 'SALARIE'] as const) {
      for (const paymentMethod of ['CASH', 'WALLET'] as const) {
        for (const discountAmount of [0, 200, 1350]) {
          const s = computeSettlement({ ...base, discountAmount, employmentType, paymentMethod, commissionPercent: 17.5 });
          expect(s.commissionAmount + s.driverEarning).toBe(s.clientDeliveryTotal);
          expect(s.driverWalletDelta + s.platformWalletDelta).toBe(0);
        }
      }
    }
  });
});
