/**
 * Choix de la règle de commission applicable à une ligne de vente : la plus spécifique
 * l'emporte (employé > général ; prestation/produit > catégorie > toutes).
 */
export interface RuleForMatching {
  id: string;
  staffId: string | null;
  appliesTo: string;
  serviceCategoryId: string | null;
  serviceId: string | null;
  productId: string | null;
  type: 'PERCENT' | 'FIXED';
  value: number;
}

export interface LineForMatching {
  type: 'SERVICE' | 'PRODUCT';
  staffId: string;
  serviceId: string | null;
  serviceCategoryId: string | null;
  productId: string | null;
  quantity: number;
  lineTotal: bigint;
}

function score(rule: RuleForMatching, line: LineForMatching): number {
  if (rule.appliesTo !== line.type) return -1;
  if (rule.staffId && rule.staffId !== line.staffId) return -1;
  let target = 1;
  if (rule.serviceId || rule.productId) {
    if (rule.serviceId && rule.serviceId !== line.serviceId) return -1;
    if (rule.productId && rule.productId !== line.productId) return -1;
    target = 3;
  } else if (rule.serviceCategoryId) {
    if (rule.serviceCategoryId !== line.serviceCategoryId) return -1;
    target = 2;
  }
  return target + (rule.staffId ? 10 : 0);
}

export function matchCommission(rules: RuleForMatching[], line: LineForMatching): { rule: RuleForMatching; amount: bigint } | null {
  let best: RuleForMatching | null = null;
  let bestScore = -1;
  for (const rule of rules) {
    const s = score(rule, line);
    if (s > bestScore) {
      best = rule;
      bestScore = s;
    }
  }
  if (!best || bestScore < 0) return null;
  const amount = best.type === 'PERCENT' ? (line.lineTotal * BigInt(best.value)) / 100n : BigInt(best.value) * BigInt(line.quantity);
  return { rule: best, amount };
}
