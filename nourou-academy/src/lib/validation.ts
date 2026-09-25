import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Adresse email invalide.").max(160);
export const nameSchema = z.string().trim().min(2, "Nom trop court.").max(100);
export const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+0-9 ()-]*$/, "Numéro invalide.")
  .optional()
  .or(z.literal(""));

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> };

export function zodErrors(err: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join(".");
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  return { error: err.issues[0]?.message ?? "Données invalides.", fieldErrors };
}

export function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function formBool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function formInt(fd: FormData, key: string, fallback = 0): number {
  const n = Number.parseInt(formString(fd, key), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function formLines(fd: FormData, key: string): string[] {
  return formString(fd, key)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 50);
}
