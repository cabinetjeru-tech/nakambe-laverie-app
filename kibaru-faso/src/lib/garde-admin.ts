import "server-only";
import { compteCourant, type Compte } from "./comptes";
import { accountsEnabled } from "./supabase/server";

/** Réservé aux comptes « admin » non suspendus. Renvoie le compte, ou la réponse d'erreur à retourner. */
export async function exigerAdmin(): Promise<{ compte: Compte; error?: undefined } | { compte?: undefined; error: Response }> {
  if (!accountsEnabled()) return { error: Response.json({ error: "Comptes non configurés." }, { status: 404 }) };
  const compte = await compteCourant().catch(() => null);
  if (!compte) return { error: Response.json({ error: "Connectez-vous." }, { status: 401 }) };
  if (compte.profil.role !== "admin" || compte.profil.suspendu) return { error: Response.json({ error: "Accès réservé à l'administration." }, { status: 403 }) };
  return { compte };
}
