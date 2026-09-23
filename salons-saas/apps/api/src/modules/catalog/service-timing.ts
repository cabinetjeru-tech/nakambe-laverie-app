/**
 * Durée, prix et découpage en étapes d'une prestation pour un employé donné.
 * Seules les étapes « bloquantes » occupent l'employé : pendant un temps de pose,
 * il reste disponible pour un autre client.
 */
export interface Segment {
  offsetMinutes: number;
  durationMinutes: number;
  blocksStaff: boolean;
}

export interface ServiceForTiming {
  basePrice: bigint;
  durationMinutes: number;
  steps: { position: number; durationMinutes: number; blocksStaff: boolean }[];
}

export interface VariantForTiming {
  price: bigint;
  durationMinutes: number;
}

export interface SkillForTiming {
  priceOverride: bigint | null;
  durationFactor: number;
}

export function computeTiming(service: ServiceForTiming, variant?: VariantForTiming | null, skill?: SkillForTiming | null) {
  const baseDuration = variant?.durationMinutes ?? service.durationMinutes;
  const factor = skill?.durationFactor ?? 100;
  const duration = Math.max(5, Math.round((baseDuration * factor) / 100 / 5) * 5);
  const price = variant?.price ?? skill?.priceOverride ?? service.basePrice;

  const steps = [...service.steps].sort((a, b) => a.position - b.position);
  const segments: Segment[] = [];
  if (steps.length === 0) {
    segments.push({ offsetMinutes: 0, durationMinutes: duration, blocksStaff: true });
  } else {
    // Étapes mises à l'échelle de la durée réelle ; la dernière absorbe l'arrondi.
    const stepsTotal = steps.reduce((sum, step) => sum + step.durationMinutes, 0);
    let offset = 0;
    steps.forEach((step, index) => {
      const length =
        index === steps.length - 1 ? duration - offset : Math.max(1, Math.round((step.durationMinutes * duration) / stepsTotal));
      if (length > 0) segments.push({ offsetMinutes: offset, durationMinutes: length, blocksStaff: step.blocksStaff });
      offset += length;
    });
  }
  return { durationMinutes: duration, price, segments };
}

/** Fusionne les étapes bloquantes contiguës (moins de lignes d'occupation). */
export function blockingRanges(segments: Segment[]): { offsetMinutes: number; durationMinutes: number }[] {
  const ranges: { offsetMinutes: number; durationMinutes: number }[] = [];
  for (const segment of segments) {
    if (!segment.blocksStaff) continue;
    const last = ranges[ranges.length - 1];
    if (last && last.offsetMinutes + last.durationMinutes === segment.offsetMinutes) {
      last.durationMinutes += segment.durationMinutes;
    } else {
      ranges.push({ offsetMinutes: segment.offsetMinutes, durationMinutes: segment.durationMinutes });
    }
  }
  return ranges;
}
