import "server-only";
import { adminClient } from "../supabase/server";
import type { Email } from "./modeles";

/**
 * Envoi par l'API transactionnelle de Brevo (BREVO_API_KEY). L'adresse d'expédition (EMAIL_EXPEDITEUR) doit être
 * validée dans Brevo. Sans clé, aucun e-mail n'est envoyé et l'application fonctionne normalement.
 */
export function emailConfigure(): boolean {
  return !!process.env.BREVO_API_KEY?.trim();
}

export function expediteur(): { email: string; name: string } {
  return { email: process.env.EMAIL_EXPEDITEUR?.trim() || "megavision.gca@gmail.com", name: process.env.EMAIL_NOM?.trim() || "PÉDAGOGUE.IA" };
}

export async function envoyerEmail(to: string, m: Email): Promise<void> {
  if (!emailConfigure()) throw new Error("BREVO_API_KEY absente");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!.trim(), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: expediteur(), replyTo: { email: expediteur().email }, to: [{ email: to }], subject: m.sujet, htmlContent: m.html, textContent: m.texte }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 300)}`);
}

/**
 * Envoie un e-mail une seule fois pour une clé donnée (ex. « paiement:<id> ») : la clé est réservée dans la table
 * emails_envoyes avant l'envoi, puis libérée si l'envoi échoue (nouvel essai possible plus tard).
 * Ne lève jamais d'erreur : un e-mail raté ne doit pas bloquer un paiement ou une connexion.
 */
export async function envoyerUneFois(o: { cle: string; type: string; utilisateurId?: string | null; to: string; email: () => Email | Promise<Email> }): Promise<boolean> {
  if (!emailConfigure()) return false;
  const db = adminClient();
  const { error } = await db.from("emails_envoyes").insert({ cle: o.cle, type: o.type, utilisateur_id: o.utilisateurId ?? null, destinataire: o.to });
  if (error) {
    if (error.code !== "23505") console.error("[email]", o.type, error.message);
    return false;
  }
  try {
    await envoyerEmail(o.to, await o.email());
    return true;
  } catch (e) {
    console.error("[email]", o.type, (e as Error).message);
    await db.from("emails_envoyes").delete().eq("cle", o.cle);
    return false;
  }
}
