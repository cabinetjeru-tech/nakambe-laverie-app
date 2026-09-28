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

async function post(path: string, body: Record<string, unknown>): Promise<{ code?: string; message?: string; description?: string; data?: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: process.env.CINETPAY_API_KEY, site_id: process.env.CINETPAY_SITE_ID, ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json().catch(() => ({}))) as { code?: string; message?: string; data?: Record<string, unknown> };
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
