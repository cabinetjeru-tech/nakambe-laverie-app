import "server-only";
import { createHash } from "node:crypto";
import { safeEqual } from "../../crypto";
import { getPaymentSettings, getSecret } from "../../settings";
import type { PaymentProvider } from "../types";

/**
 * PayDunya — agrégateur (Sénégal, Côte d'Ivoire, Bénin, Burkina Faso… selon contrat).
 * Checkout « invoice » + IPN, puis confirmation serveur-à-serveur.
 * Doc : https://developers.paydunya.com
 */
async function creds() {
  const s = await getPaymentSettings();
  return {
    base: s.paydunyaMode === "live" ? "https://app.paydunya.com/api/v1" : "https://app.paydunya.com/sandbox-api/v1",
    storeName: s.paydunyaStoreName,
    master: await getSecret("payments.paydunya.masterKey"),
    priv: await getSecret("payments.paydunya.privateKey"),
    token: await getSecret("payments.paydunya.token"),
  };
}

function headersFor(c: Awaited<ReturnType<typeof creds>>) {
  return {
    "Content-Type": "application/json",
    "PAYDUNYA-MASTER-KEY": c.master || "",
    "PAYDUNYA-PRIVATE-KEY": c.priv || "",
    "PAYDUNYA-TOKEN": c.token || "",
  };
}

export const paydunya: PaymentProvider = {
  id: "paydunya",
  label: "Mobile Money & carte (PayDunya)",
  description: "Paiement via la page sécurisée PayDunya (moyens disponibles selon votre pays).",
  async isConfigured() {
    const c = await creds();
    return !!(c.master && c.priv && c.token);
  },
  async initiate(input) {
    const c = await creds();
    const res = await fetch(`${c.base}/checkout-invoice/create`, {
      method: "POST",
      headers: headersFor(c),
      body: JSON.stringify({
        invoice: { total_amount: input.amount, description: input.description.slice(0, 200) },
        store: { name: c.storeName },
        actions: { callback_url: input.notifyUrl, return_url: input.returnUrl, cancel_url: input.cancelUrl },
        custom_data: { reference: input.reference },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { response_code?: string; response_text?: string; token?: string };
    if (json.response_code !== "00" || !json.response_text || !json.token) throw new Error(`PayDunya : ${json.response_text || "initialisation refusée"}`);
    return { redirectUrl: json.response_text, providerRef: json.token };
  },
  async verify(order) {
    const c = await creds();
    if (!order.providerRef) return { status: "PENDING", raw: { error: "jeton PayDunya manquant" } };
    const res = await fetch(`${c.base}/checkout-invoice/confirm/${encodeURIComponent(order.providerRef)}`, { headers: headersFor(c) });
    const json = (await res.json().catch(() => ({}))) as {
      response_code?: string;
      status?: string;
      invoice?: { total_amount?: number | string };
      custom_data?: { reference?: string };
    };
    if (json.custom_data?.reference && json.custom_data.reference !== order.reference) {
      return { status: "FAILED", raw: { error: "référence incohérente" } };
    }
    return {
      status: json.status === "completed" ? "PAID" : json.status === "cancelled" || json.status === "failed" ? "FAILED" : "PENDING",
      amount: json.invoice?.total_amount !== undefined ? Number(json.invoice.total_amount) : undefined,
      currency: "XOF",
      providerRef: order.providerRef,
      raw: json,
    };
  },
  async parseWebhook({ rawBody }) {
    // L'IPN PayDunya est envoyé en application/x-www-form-urlencoded : data[hash], data[invoice][token], …
    const c = await creds();
    const f = new URLSearchParams(rawBody);
    const hash = f.get("data[hash]");
    if (!c.master || !hash) return null;
    const expected = createHash("sha512").update(c.master).digest("hex");
    if (!safeEqual(expected, hash)) return null;
    return { reference: f.get("data[custom_data][reference]"), providerRef: f.get("data[invoice][token]"), signatureChecked: true };
  },
};
