/**
 * Numéros burkinabè : 8 chiffres, indicatif +226.
 * Accepte "70 12 34 56", "0022670123456", "+226 70-12-34-56"... et renvoie "+22670123456".
 * Renvoie null si le numéro n'est pas valide.
 */
export function normalizeBurkinaPhone(input: string): string | null {
  if (!input) return null;
  let digits = input.replace(/[\s\-.()]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 11 && digits.startsWith('226')) digits = digits.slice(3);
  if (digits.length !== 8) return null;
  // Les numéros mobiles et fixes du Burkina Faso commencent par 0, 2, 5, 6 ou 7.
  if (!/^[02567]/.test(digits)) return null;
  return `+226${digits}`;
}

/** Masque un numéro pour l'affichage à un tiers : +226 70 •• •• 56 */
export function maskPhone(phone: string): string {
  const local = phone.replace(/^\+226/, '');
  if (local.length !== 8) return phone;
  return `+226 ${local.slice(0, 2)} •• •• ${local.slice(6)}`;
}
