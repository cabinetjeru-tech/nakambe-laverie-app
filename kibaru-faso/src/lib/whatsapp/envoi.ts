import "server-only";
import { decouper, versWhatsApp } from "./meta";

/**
 * Envoi de messages par l'API WhatsApp Cloud (Meta Graph API).
 * Variables : WHATSAPP_TOKEN (jeton d'accès permanent d'un utilisateur système), WHATSAPP_PHONE_NUMBER_ID,
 * WHATSAPP_VERIFY_TOKEN (vérification du webhook), WHATSAPP_APP_SECRET (signature des notifications).
 */

export function whatsappConfigure(): { ok: boolean; manquantes: string[] } {
  const requises = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"];
  const manquantes = requises.filter((k) => !process.env[k]?.trim());
  return { ok: manquantes.length === 0, manquantes };
}

const version = () => process.env.WHATSAPP_API_VERSION?.trim() || "v23.0";

/** Envoie un texte (découpé si nécessaire). Lève une erreur explicite en cas de refus de Meta. */
export async function envoyerTexte(destinataire: string, texte: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !numero) throw new Error("WhatsApp non configuré (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID).");
  for (const morceau of decouper(versWhatsApp(texte))) {
    const r = await fetch(`https://graph.facebook.com/${version()}/${numero}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: destinataire, type: "text", text: { preview_url: true, body: morceau } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Meta ${r.status} : ${(await r.text()).slice(0, 300)}`);
  }
}

/** Marque un message reçu comme lu (double coche bleue) : le client voit que sa demande est prise en compte. */
export async function marquerLu(messageId: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !numero) return;
  await fetch(`https://graph.facebook.com/${version()}/${numero}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
