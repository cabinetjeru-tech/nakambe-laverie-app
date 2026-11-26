/** Formate un montant entier en FCFA : 12500 → « 12 500 FCFA ». */
export function formatFCFA(amount: number | null | undefined, withUnit = true): string {
  const n = Math.round(Number(amount ?? 0));
  const sign = n < 0 ? '-' : '';
  const s = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${s}${withUnit ? ' FCFA' : ''}`;
}

export interface SaleLineInput {
  quantity: number;
  unitPrice: number;
  lineDiscount?: number;
}

export interface SaleTotals {
  lines: { total: number }[];
  subtotal: number;
  discount: number;
  loyaltyDiscount: number;
  total: number;
}

/**
 * Calcule les totaux d'une vente. Toutes les valeurs sont des entiers FCFA.
 * Lève une erreur si une remise dépasse le montant concerné.
 */
export function computeSaleTotals(lines: SaleLineInput[], discount = 0, loyaltyDiscount = 0): SaleTotals {
  const computed = lines.map((l) => {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error('Quantité invalide');
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) throw new Error('Prix invalide');
    const gross = l.quantity * l.unitPrice;
    const ld = l.lineDiscount ?? 0;
    if (ld < 0 || ld > gross) throw new Error('Remise de ligne invalide');
    return { total: gross - ld };
  });
  const subtotal = computed.reduce((s, l) => s + l.total, 0);
  if (discount < 0 || loyaltyDiscount < 0) throw new Error('Remise négative');
  if (discount + loyaltyDiscount > subtotal) throw new Error('La remise dépasse le montant de la vente');
  return { lines: computed, subtotal, discount, loyaltyDiscount, total: subtotal - discount - loyaltyDiscount };
}

/** Commission due sur une prestation. */
export function computeCommission(base: number, type: 'PERCENT' | 'FIXED' | 'NONE', value: number, quantity = 1): number {
  if (type === 'NONE' || !value) return 0;
  if (type === 'PERCENT') return Math.round((base * value) / 100);
  return Math.round(value * quantity);
}

export function paymentStatusOf(total: number, paid: number): 'UNPAID' | 'PARTIAL' | 'PAID' {
  if (paid <= 0) return total === 0 ? 'PAID' : 'UNPAID';
  return paid >= total ? 'PAID' : 'PARTIAL';
}
