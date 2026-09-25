import "server-only";
import { hmacHex, safeEqual } from "../../crypto";
import { getPaymentSettings, getSecret } from "../../settings";
import type { PaymentProvider } from "../types";

/**
 * CinetPay — agrégateur Mobile Money (Orange Money, Moov Money, …) et cartes bancaires
 * dans plusieurs pays d'Afrique de l'Ouest. Disponibilité des moyens de paiement selon
 * le pays et le contrat marchand : à vérifier avec CinetPay.
 * Doc : https://docs.cinetpay.com
 */
const API = "https://api-checkout.cinetpay.com/v2";

/** Ordre des champs pour le calcul du jeton HMAC (x-token) des notifications CinetPay. */
export const CINETPAY_TOKEN_FIELDS = [
  "cpm_site_id", "cpm_trans_id", "cpm_trans_date", "cpm_amount", "cpm_currency", "signature", "payment_method",
  "cel_phone_num", "cpm_phone_prefixe", "cpm_language", "cpm_version", "cpm_payment_config", "cpm_page_action",
  "cpm_custom", "cpm_designation", "cpm_error_message",
] as const;

export function cinetpayToken(fields: URLSearchParams, secret: string) {
  const data = CINETPAY_TOKEN_FIELDS.map((f) => fields.get(f) ?? "").join("");
  return hmacHex(secret, data, "sha256");
}

async function creds() {
  const s = await getPaymentSettings();
  return { siteId: s.cinetpaySiteId, apiKey: await getSecret("payments.cinetpay.apiKey"), secretKey: await getSecret("payments.cinetpay.secretKey") };
}

export const cinetpay: PaymentProvider = {
  id: "cinetpay",
  label: "Mobile Money & carte (CinetPay)",
  description: "Orange Money, Moov Money, carte bancaire… selon disponibilité dans votre pays.",
  async isConfigured() {
    const c = await creds();
    return !!(c.siteId && c.apiKey);
  },
  async initiate(input) {
    const c = await creds();
    const res = await fetch(`${API}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: c.apiKey,
        site_id: c.siteId,
        transaction_id: input.reference,
        amount: input.amount,
        currency: "XOF",
        description: input.description.replace(/[^\p{L}\p{N} .,-]/gu, "").slice(0, 120),
        notify_url: input.notifyUrl,
        return_url: input.returnUrl,
        channels: "ALL",
        lang: "fr",
        customer_name: input.customer.name,
        customer_email: input.customer.email,
        customer_phone_number: input.customer.phone ?? undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { code?: string; message?: string; data?: { payment_url?: string } };
    if (json.code !== "201" || !json.data?.payment_url) throw new Error(`CinetPay : ${json.message || "initialisation refusée"}`);
    return { redirectUrl: json.data.payment_url };
  },
  async verify(order) {
    const c = await creds();
    const res = await fetch(`${API}/payment/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: c.apiKey, site_id: c.siteId, transaction_id: order.reference }),
    });
    const json = (await res.json().catch(() => ({}))) as { code?: string; data?: { status?: string; amount?: string | number; currency?: string; operator_id?: string } };
    const st = json.data?.status;
    return {
      status: st === "ACCEPTED" ? "PAID" : st === "REFUSED" || st === "CANCELED" ? "FAILED" : "PENDING",
      amount: json.data?.amount !== undefined ? Number(json.data.amount) : undefined,
      currency: json.data?.currency,
      providerRef: json.data?.operator_id,
      raw: json,
    };
  },
  async parseWebhook({ headers, rawBody }) {
    const fields = new URLSearchParams(rawBody);
    const c = await creds();
    const token = headers.get("x-token");
    let signatureChecked = false;
    if (c.secretKey) {
      if (!token || !safeEqual(cinetpayToken(fields, c.secretKey), token)) return null;
      signatureChecked = true;
    }
    if (c.siteId && fields.get("cpm_site_id") && fields.get("cpm_site_id") !== c.siteId) return null;
    return { reference: fields.get("cpm_trans_id"), signatureChecked };
  },
};
