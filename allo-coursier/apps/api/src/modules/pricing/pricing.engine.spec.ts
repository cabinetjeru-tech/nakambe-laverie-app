import { DeliverySpeed, ServiceType, VehicleType } from '@prisma/client';
import { computeQuote, PricingRuleParams, roundUpToStep, selectPricingRule, SelectableRule } from './pricing.engine';

const rule: PricingRuleParams = {
  baseFare: 500,
  minFare: 1000,
  pricePerKm: 150,
  includedKm: 2,
  expressFixed: 500,
  expressPercent: 0,
  waitingFreeMinutes: 10,
  waitingPricePerMinute: 25,
  nightSurcharge: 300,
  nightStart: '21:00',
  nightEnd: '06:00',
  purchaseFeePercent: 10,
  purchaseFeeMin: 200,
  extraStopFee: 300,
  commissionPercent: 20,
  roundingStep: 50,
};

const day = { speed: DeliverySpeed.STANDARD, localTime: '14:00' };

describe('computeQuote', () => {
  it('applique le prix minimum sur une course courte', () => {
    const q = computeQuote(rule, { ...day, distanceKm: 1.5 });
    expect(q.minFareApplied).toBe(true);
    expect(q.deliveryFee).toBe(1000);
    expect(q.lines).toEqual([{ code: 'COURSE', label: 'Course (prix minimum)', amount: 1000 }]);
  });

  it('facture les km au-delà des km inclus et arrondit au pas supérieur', () => {
    // 500 + (6.3 − 2) × 150 = 500 + 645 = 1145 → arrondi à 1150
    const q = computeQuote(rule, { ...day, distanceKm: 6.3 });
    expect(q.lines[0].amount).toBe(1145);
    expect(q.deliveryFee).toBe(1150);
    expect(q.lines.at(-1)).toEqual({ code: 'ROUNDING', label: 'Arrondi', amount: 5 });
    expect(q.totalToPay).toBe(1150);
  });

  it('ajoute le supplément express fixe et en pourcentage', () => {
    const q = computeQuote({ ...rule, expressPercent: 10 }, { ...day, distanceKm: 6, speed: DeliverySpeed.EXPRESS });
    // course = 500 + 4 × 150 = 1100 ; express = 500 + 110 = 610 ; total 1710 → 1750
    expect(q.lines.find((l) => l.code === 'EXPRESS')?.amount).toBe(610);
    expect(q.deliveryFee).toBe(1750);
  });

  it("n'ajoute pas d'express en livraison standard", () => {
    const q = computeQuote(rule, { ...day, distanceKm: 6 });
    expect(q.lines.some((l) => l.code === 'EXPRESS')).toBe(false);
  });

  it('applique le supplément de nuit sur une plage qui passe minuit', () => {
    expect(computeQuote(rule, { ...day, distanceKm: 3, localTime: '22:30' }).isNight).toBe(true);
    expect(computeQuote(rule, { ...day, distanceKm: 3, localTime: '05:59' }).isNight).toBe(true);
    expect(computeQuote(rule, { ...day, distanceKm: 3, localTime: '06:00' }).isNight).toBe(false);
    expect(computeQuote(rule, { ...day, distanceKm: 3, localTime: '20:59' }).isNight).toBe(false);
    const q = computeQuote(rule, { ...day, distanceKm: 3, localTime: '23:00' });
    expect(q.lines.find((l) => l.code === 'NIGHT')?.amount).toBe(300);
  });

  it("n'applique pas de nuit si la plage n'est pas configurée", () => {
    const q = computeQuote({ ...rule, nightStart: null, nightEnd: null }, { ...day, distanceKm: 3, localTime: '23:00' });
    expect(q.isNight).toBe(false);
  });

  it("calcule les frais d'achat avec un minimum et ajoute le montant avancé au total", () => {
    const small = computeQuote(rule, { ...day, distanceKm: 1, purchaseAmount: 1500 });
    expect(small.lines.find((l) => l.code === 'PURCHASE_FEE')?.amount).toBe(200); // 10 % = 150 < minimum 200
    expect(small.deliveryFee).toBe(1200);
    expect(small.totalToPay).toBe(1200 + 1500);

    const big = computeQuote(rule, { ...day, distanceKm: 1, purchaseAmount: 10_000 });
    expect(big.lines.find((l) => l.code === 'PURCHASE_FEE')?.amount).toBe(1000);
  });

  it('facture les arrêts supplémentaires et l’attente au-delà du temps gratuit', () => {
    const q = computeQuote(rule, { ...day, distanceKm: 1, extraStops: 2, waitingMinutes: 14.2 });
    expect(q.lines.find((l) => l.code === 'EXTRA_STOPS')).toEqual({
      code: 'EXTRA_STOPS',
      label: 'Arrêts supplémentaires (2)',
      amount: 600,
    });
    // 14,2 min → 15 min, dont 10 gratuites → 5 × 25
    expect(q.lines.find((l) => l.code === 'WAITING')?.amount).toBe(125);
  });

  it("n'attribue pas d'attente dans le temps gratuit", () => {
    const q = computeQuote(rule, { ...day, distanceKm: 1, waitingMinutes: 10 });
    expect(q.lines.some((l) => l.code === 'WAITING')).toBe(false);
  });

  it('répartit commission et gain du livreur, avec taux propre prioritaire', () => {
    const q = computeQuote(rule, { ...day, distanceKm: 6.3 });
    expect(q.commissionAmount).toBe(230); // 20 % de 1150
    expect(q.driverEarning).toBe(920);
    const custom = computeQuote(rule, { ...day, distanceKm: 6.3, commissionPercentOverride: 15 });
    expect(custom.commissionPercent).toBe(15);
    expect(custom.commissionAmount + custom.driverEarning).toBe(custom.deliveryFee);
  });

  it('la somme des lignes est toujours égale aux frais de livraison', () => {
    for (const distanceKm of [0, 0.4, 2, 3.33, 7.77, 18.2]) {
      for (const speed of [DeliverySpeed.STANDARD, DeliverySpeed.EXPRESS]) {
        const q = computeQuote(rule, { distanceKm, speed, localTime: '23:10', purchaseAmount: 3333, extraStops: 1, waitingMinutes: 17 });
        expect(q.lines.reduce((s, l) => s + l.amount, 0)).toBe(q.deliveryFee);
        expect(q.deliveryFee % rule.roundingStep).toBe(0);
      }
    }
  });

  it('refuse une distance négative', () => {
    expect(() => computeQuote(rule, { ...day, distanceKm: -1 })).toThrow(RangeError);
  });
});

describe('roundUpToStep', () => {
  it('arrondit au multiple supérieur', () => {
    expect(roundUpToStep(1001, 50)).toBe(1050);
    expect(roundUpToStep(1050, 50)).toBe(1050);
    expect(roundUpToStep(1001, 25)).toBe(1025);
    expect(roundUpToStep(1001, 1)).toBe(1001);
  });
});

describe('selectPricingRule', () => {
  const at = new Date('2026-06-01T12:00:00Z');
  const base: SelectableRule = {
    id: 'ville',
    zoneId: null,
    serviceType: null,
    vehicleType: null,
    priority: 0,
    isActive: true,
    validFrom: new Date('2026-01-01'),
    validTo: null,
  };
  const criteria = { zoneId: 'z1', serviceType: ServiceType.PARCEL, vehicleType: VehicleType.MOTO, at };

  it('choisit la règle la plus spécifique', () => {
    const rules: SelectableRule[] = [
      base,
      { ...base, id: 'moto', vehicleType: VehicleType.MOTO },
      { ...base, id: 'colis', serviceType: ServiceType.PARCEL },
      { ...base, id: 'zone', zoneId: 'z1' },
    ];
    expect(selectPricingRule(rules, criteria)?.id).toBe('zone');
    expect(selectPricingRule(rules, { ...criteria, zoneId: null })?.id).toBe('colis');
    expect(selectPricingRule(rules, { ...criteria, zoneId: null, serviceType: ServiceType.ERRAND })?.id).toBe('moto');
  });

  it('ignore les règles qui ne correspondent pas', () => {
    const rules: SelectableRule[] = [
      { ...base, id: 'tricycle', vehicleType: VehicleType.TRICYCLE },
      { ...base, id: 'autre-zone', zoneId: 'z2' },
      { ...base, id: 'inactive', isActive: false },
      { ...base, id: 'future', validFrom: new Date('2027-01-01') },
      { ...base, id: 'expiree', validTo: new Date('2026-05-01') },
    ];
    expect(selectPricingRule(rules, criteria)).toBeNull();
  });

  it('départage par priorité puis par date de début la plus récente', () => {
    const rules: SelectableRule[] = [
      { ...base, id: 'ancienne' },
      { ...base, id: 'recente', validFrom: new Date('2026-03-01') },
    ];
    expect(selectPricingRule(rules, criteria)?.id).toBe('recente');
    expect(selectPricingRule([...rules, { ...base, id: 'prioritaire', priority: 5 }], criteria)?.id).toBe('prioritaire');
  });
});
