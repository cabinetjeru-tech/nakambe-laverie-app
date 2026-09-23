import { blockingRanges, computeTiming } from './service-timing';

describe('computeTiming', () => {
  const coloration = {
    basePrice: 10_000n,
    durationMinutes: 90,
    steps: [
      { position: 1, durationMinutes: 30, blocksStaff: true },
      { position: 2, durationMinutes: 40, blocksStaff: false },
      { position: 3, durationMinutes: 20, blocksStaff: true },
    ],
  };

  it('découpe la prestation en étapes et laisse le temps de pose libre', () => {
    const timing = computeTiming(coloration);
    expect(timing.durationMinutes).toBe(90);
    expect(blockingRanges(timing.segments)).toEqual([
      { offsetMinutes: 0, durationMinutes: 30 },
      { offsetMinutes: 70, durationMinutes: 20 },
    ]);
  });

  it('applique la variante et met les étapes à l’échelle', () => {
    const timing = computeTiming(coloration, { price: 15_000n, durationMinutes: 180 });
    expect(timing.price).toBe(15_000n);
    expect(timing.durationMinutes).toBe(180);
    expect(timing.segments.reduce((s, x) => s + x.durationMinutes, 0)).toBe(180);
  });

  it('applique le tarif et le rythme propres à un employé', () => {
    const timing = computeTiming({ basePrice: 5_000n, durationMinutes: 60, steps: [] }, null, { priceOverride: 7_000n, durationFactor: 150 });
    expect(timing).toEqual({ durationMinutes: 90, price: 7_000n, segments: [{ offsetMinutes: 0, durationMinutes: 90, blocksStaff: true }] });
  });
});
