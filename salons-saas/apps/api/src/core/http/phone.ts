/**
 * Normalise un numéro au format E.164 (+22670123456).
 * Sans indicatif, un numéro à 8 chiffres est considéré burkinabè (+226).
 * Renvoie null si le numéro est invalide.
 */
export function normalizePhone(raw: string, defaultCountryCode = '226'): string | null {
  let value = raw.replace(/[\s.\-()]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (/^\d{8}$/.test(value)) value = `+${defaultCountryCode}${value}`;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
