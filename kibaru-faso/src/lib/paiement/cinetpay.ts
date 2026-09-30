import "server-only";
import { statutCinetpay, type StatutPaiement } from "../abonnement";

/**
 * Paiement mobile money par CinetPay (Orange Money, Moov Money… au Burkina Faso), en francs CFA.
 * Variables : CINETPAY_API_KEY et CINETPAY_SITE_ID (compte marchand CinetPay).
 * La notification de CinetPay n'est jamais crue sur parole : le statut est toujours revérifié auprès de l'API.
 * À valider avec la documentation CinetPay lors de l'ouverture du compte marchand.
 */

const BASE = process.env.CINETPAY_API_URL?.replace(/\/$/, "") || "https://api-checkout.cinetpay.com/v2";

export function paiementDisponible(): boolean {
  return !!(process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID);
}

export class PaiementError extends Error {}

type Initialisation = {
  transactionId: string;
  montant: number;
  description: string;
  notifyUrl: string;
  returnUrl: string;
  client: { email: string; nom?: string | null; telephone?: string | null; ville?: string | null };
};

/** Cause réseau lisible d'un « fetch failed » (DNS, connexion, certificat…), pour le diagnostic. */
export function causeReseau(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string; errno?: string } };
  const c = err?.cause;
  const detail = c ? [c.code ?? c.errno, c.message].filter(Boolean).join(" — ") : "";
  return detail ? `${err.message} (${detail})` : (err?.message ?? String(e));
}

type Reponse = { code?: string; message?: string; description?: string; data?: Record<string, unknown> };

/** Appel à l'API CinetPay ; une nouvelle tentative en cas d'erreur réseau (pas en cas de réponse de CinetPay). */
async function post(path: string, body: Record<string, unknown>): Promise<Reponse> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "PEDAGOGUE.IA/1.0 (+https://pedagogue-ia.vercel.app)" },
        body: JSON.stringify({ apikey: process.env.CINETPAY_API_KEY?.trim(), site_id: process.env.CINETPAY_SITE_ID?.trim(), ...body }),
        signal: AbortSignal.timeout(20_000),
      });
      const texte = await res.text();
      try {
        return JSON.parse(texte) as Reponse;
      } catch {
        const brut = texte.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
        return { code: `HTTP ${res.status}`, message: brut || "réponse vide" };
      }
    } catch (e) {
      derniere = e;
      if (essai === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`Connexion à CinetPay impossible : ${causeReseau(derniere)}`);
}

/**
 * Diagnostic (espace admin) : l'application joint-elle CinetPay, et les clés sont-elles acceptées ?
 * Vérifie une transaction inexistante : « transaction introuvable » signifie que tout est en ordre.
 */
export async function diagnosticCinetpay(): Promise<{ ok: boolean; message: string }> {
  if (!paiementDisponible()) return { ok: false, message: "CINETPAY_API_KEY ou CINETPAY_SITE_ID absent dans Vercel." };
  const host = new URL(BASE).hostname;
  let ip = "?";
  try {
    const { lookup } = await import("node:dns/promises");
    ip = (await lookup(host)).address;
  } catch (e) {
    return { ok: false, message: `Adresse ${host} introuvable (DNS) : ${(e as Error).message}` };
  }
  try {
    const r = await post("/payment/check", { transaction_id: `DIAG${Date.now()}` });
    const texte = `${r.code ?? "?"} ${r.message ?? ""}${r.description ? ` — ${r.description}` : ""}`.trim();
    if (r.code === "627" || /TRANSACTION_NOT_FOUND|NOT_FOUND/i.test(r.message ?? "")) return { ok: true, message: `CinetPay joint (${host} → ${ip}), clés acceptées (${texte}).` };
    return { ok: false, message: `CinetPay joint (${host} → ${ip}) mais réponse inattendue : ${texte}` };
  } catch (e) {
    return { ok: false, message: `${host} → ${ip} : ${(e as Error).message}` };
  }
}

/** Identité du client au format CinetPay (exigée pour le paiement par carte), avec valeurs par défaut. */
export function identiteClient(c: { email: string; nom?: string | null; telephone?: string | null; ville?: string | null }) {
  const parts = (c.nom ?? "").trim().split(/\s+/).filter(Boolean);
  const nom = parts.length > 1 ? parts[parts.length - 1]! : parts[0] || "Enseignant";
  const prenom = parts.length > 1 ? parts.slice(0, -1).join(" ") : "PEDAGOGUE.IA";
  const tel = (c.telephone ?? "").replace(/[^0-9+]/g, "");
  const ville = c.ville?.trim() || "Ouagadougou";
  return {
    customer_name: nom,
    customer_surname: prenom,
    customer_email: c.email,
    ...(tel ? { customer_phone_number: tel } : {}),
    customer_address: ville,
    customer_city: ville,
    customer_country: "BF",
    customer_state: "BF",
    customer_zip_code: "00000",
  };
}

/** Crée le paiement chez CinetPay et renvoie l'adresse de la page de paiement. */
export async function initialiserPaiement(p: Initialisation): Promise<string> {
  const r = await post("/payment", {
    transaction_id: p.transactionId,
    amount: p.montant,
    currency: "XOF",
    description: p.description.replace(/[^\p{L}\p{N} .,'-]/gu, " ").slice(0, 100),
    notify_url: p.notifyUrl,
    return_url: p.returnUrl,
    // Mobile money (Orange Money, Moov Money…) et carte bancaire, selon le contrat marchand.
    channels: process.env.CINETPAY_CHANNELS || "ALL",
    lang: "fr",
    ...identiteClient(p.client),
  });
  const url = typeof r.data?.payment_url === "string" ? r.data.payment_url : undefined;
  if (r.code !== "201" || !url) throw new PaiementError(`CinetPay : ${r.description ?? r.message ?? "initialisation refusée"}`);
  return url;
}

/** Statut réel d'une transaction, avec le montant effectivement payé. */
export async function verifierPaiement(transactionId: string): Promise<{ statut: StatutPaiement; montant?: number; moyen?: string; brut: unknown }> {
  const r = await post("/payment/check", { transaction_id: transactionId });
  const d = r.data ?? {};
  return {
    statut: statutCinetpay(typeof d.status === "string" ? d.status : undefined),
    montant: d.amount !== undefined ? Number(d.amount) : undefined,
    moyen: typeof d.payment_method === "string" ? d.payment_method : undefined,
    brut: r,
  };
}
