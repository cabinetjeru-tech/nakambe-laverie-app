import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * API WhatsApp Cloud (Meta) : vérification des notifications, lecture des messages reçus, découpage des réponses.
 * Fonctions pures (testables) ; l'envoi est dans envoi.ts.
 */

/** Vérifie la signature X-Hub-Signature-256 (HMAC SHA-256 du corps brut avec le secret de l'application Meta). */
export function signatureValide(corps: string, entete: string | null, secret: string | undefined): boolean {
  if (!secret || !entete?.startsWith("sha256=")) return false;
  const attendu = createHmac("sha256", secret).update(corps, "utf8").digest("hex");
  const recu = entete.slice(7);
  if (recu.length !== attendu.length) return false;
  return timingSafeEqual(Buffer.from(recu, "hex"), Buffer.from(attendu, "hex"));
}

export type MessageRecu = {
  /** Identifiant Meta du message (pour ne pas le traiter deux fois). */
  id: string;
  /** Numéro de l'expéditeur, international sans « + ». */
  de: string;
  nom: string | null;
  /** Texte du message ; null pour un message non textuel (audio, image, document…). */
  texte: string | null;
  type: string;
  horodatage: number;
};

type Charge = {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
      };
    }[];
  }[];
};

/** Messages reçus dans une notification Meta (les accusés de lecture et statuts d'envoi sont ignorés). */
export function messagesRecus(charge: unknown): MessageRecu[] {
  const out: MessageRecu[] = [];
  for (const e of (charge as Charge)?.entry ?? [])
    for (const c of e.changes ?? []) {
      if (c.field && c.field !== "messages") continue;
      const noms = new Map((c.value?.contacts ?? []).map((x) => [x.wa_id ?? "", x.profile?.name ?? null]));
      for (const m of c.value?.messages ?? []) {
        if (!m.id || !m.from) continue;
        const texte = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        out.push({ id: m.id, de: m.from, nom: noms.get(m.from) ?? null, texte: texte?.trim() || null, type: m.type ?? "inconnu", horodatage: Number(m.timestamp ?? 0) });
      }
    }
  return out;
}

/** WhatsApp limite un message texte à 4 096 caractères : découpe aux paragraphes. */
export function decouper(texte: string, max = 3800): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const p of texte.split(/\n{2,}/)) {
    if (cur && cur.length + p.length + 2 > max) {
      parts.push(cur);
      cur = "";
    }
    if (p.length > max) {
      for (let i = 0; i < p.length; i += max) parts.push(p.slice(i, i + max));
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Mise en forme WhatsApp : **gras** Markdown → *gras* WhatsApp ; titres Markdown → gras. */
export function versWhatsApp(texte: string): string {
  return texte
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .trim();
}

/** L'agent termine sa réponse par [CONSEILLER] quand un humain doit prendre le relais. */
export function extraireRelais(reponse: string): { texte: string; relais: boolean; motif: string | null } {
  const m = reponse.match(/\[CONSEILLER(?::\s*([^\]]*))?\]\s*$/);
  if (!m) return { texte: reponse.trim(), relais: false, motif: null };
  return { texte: reponse.slice(0, m.index).trim(), relais: true, motif: m[1]?.trim() || "demande de conseiller" };
}

/** Le client demande explicitement un humain (repérage sans IA, avant tout appel). */
export function demandeHumain(texte: string): boolean {
  const n = texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /\b(parler|discuter|joindre|appeler)\b.{0,30}\b(humain|personne|agent|conseiller|responsable|quelqu'?un)\b|\b(un|une) (humain|conseiller|conseillere|vraie personne)\b/.test(n);
}
