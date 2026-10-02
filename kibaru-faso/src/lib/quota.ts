/** Quotas de générations : état et plafond atteint. Module pur (testable sans base de données). */

export type EtatQuota = { limite: number | null; utilisees: number; periode: { limite: number; utilisees: number } | null };

/** Quel plafond est atteint (le plafond de la formule l'emporte : il ne se renouvelle pas à minuit). */
export function plafondAtteint(q: EtatQuota): "periode" | "jour" | null {
  if (q.periode && q.periode.utilisees >= q.periode.limite) return "periode";
  if (q.limite !== null && q.utilisees >= q.limite) return "jour";
  return null;
}

/** Unités décomptées pour une génération : le mode expert (modèle deux fois plus cher) compte double. */
export function unitesGeneration(mode: string | undefined): number {
  return mode === "expert" ? 2 : 1;
}
