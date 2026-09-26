import { randomInt } from 'crypto';

/** Règles de choix du code secret (PIN) des clients et livreurs. */
export function pinPolicyError(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'Le code secret doit contenir 4 à 6 chiffres.';
  if (/^(\d)\1+$/.test(pin)) return 'Le code secret ne doit pas être composé du même chiffre.';
  const ascending = '0123456789';
  const descending = '9876543210';
  if (ascending.includes(pin) || descending.includes(pin)) {
    return 'Le code secret ne doit pas être une suite de chiffres (ex. 1234).';
  }
  return null;
}

/** Règles du mot de passe du personnel (administration). */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  }
  return null;
}

/** Génère un code secret temporaire à 6 chiffres respectant la politique. */
export function generateTemporaryPin(): string {
  for (;;) {
    const pin = Array.from({ length: 6 }, () => randomInt(10)).join('');
    if (!pinPolicyError(pin)) return pin;
  }
}

/** Génère un mot de passe temporaire lisible (sans caractères ambigus) pour l'équipe. */
export function generateTemporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (chars: string) => chars[randomInt(chars.length)];
  const body = Array.from({ length: 8 }, () => pick(letters + digits)).join('');
  return `${body}${pick(digits)}${pick(letters)}`;
}
