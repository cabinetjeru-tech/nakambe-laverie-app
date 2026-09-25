import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Règle de robustesse : 8 caractères minimum, au moins une lettre et un chiffre. */
export function passwordIssue(pwd: string): string | null {
  if (pwd.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
  if (pwd.length > 200) return "Mot de passe trop long.";
  return null;
}
