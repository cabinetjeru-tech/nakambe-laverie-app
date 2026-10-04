import { after } from "next/server";
import { whatsappConfigure } from "@/lib/whatsapp/envoi";
import { messagesRecus, signatureValide } from "@/lib/whatsapp/meta";
import { traiterMessage } from "@/lib/whatsapp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook de l'API WhatsApp Cloud (Meta). À déclarer dans l'application Meta :
 * URL https://<site>/api/whatsapp, jeton de vérification = WHATSAPP_VERIFY_TOKEN, champ « messages ».
 */

/** Vérification du webhook par Meta (une fois, à la configuration). */
export function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const attendu = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (attendu && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === attendu) return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Interdit", { status: 403 });
}

/** Notification de Meta : réponse immédiate (200), traitement des messages juste après. */
export async function POST(req: Request) {
  if (!whatsappConfigure().ok) return new Response("WhatsApp non configuré", { status: 503 });
  const corps = await req.text();
  if (!signatureValide(corps, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET?.trim())) return new Response("Signature invalide", { status: 401 });
  let charge: unknown;
  try {
    charge = JSON.parse(corps);
  } catch {
    return new Response("JSON invalide", { status: 400 });
  }
  const messages = messagesRecus(charge);
  if (messages.length)
    after(async () => {
      for (const m of messages) await traiterMessage(m);
    });
  return new Response("OK", { status: 200 });
}
