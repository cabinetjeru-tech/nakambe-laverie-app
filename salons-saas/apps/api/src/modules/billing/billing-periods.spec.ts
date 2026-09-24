import { addCycle, monthlyEquivalent, prorata } from './billing-periods';

describe('périodes de facturation', () => {
  it('ajoute un mois en gardant le jour, ou le dernier jour du mois', () => {
    expect(addCycle(new Date('2026-01-15T10:00:00Z'), 'MONTHLY').toISOString()).toBe('2026-02-15T10:00:00.000Z');
    expect(addCycle(new Date('2026-01-31T10:00:00Z'), 'MONTHLY').toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addCycle(new Date('2026-03-01T00:00:00Z'), 'YEARLY').toISOString()).toBe('2027-03-01T00:00:00.000Z');
  });

  it('calcule le prorata du temps restant, arrondi à la dizaine', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-31T00:00:00Z');
    expect(prorata(20_000n, new Date('2026-01-16T00:00:00Z'), start, end)).toBe(10_000n);
    expect(prorata(20_000n, end, start, end)).toBe(0n);
    expect(prorata(20_000n, start, start, end)).toBe(20_000n);
    // Période payée d'avance, pas encore commencée : jamais plus que la période entière.
    expect(prorata(20_000n, new Date('2025-12-20T00:00:00Z'), start, end)).toBe(20_000n);
  });

  it('compare des offres de cycles différents', () => {
    expect(monthlyEquivalent({ priceMonthly: 15_000n, priceYearly: 150_000n }, 'YEARLY')).toBe(12_500n);
  });
});
