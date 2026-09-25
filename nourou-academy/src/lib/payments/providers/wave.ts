import "server-only";
import { hmacHex, safeEqual } from "../../crypto";
import { getSecret } from "../../settings";
import type { PaymentProvider } from "../types";

/**
 * Wave — API Checkout. Disponible uniquement dans les pays où Wave Business propose
 * l'API marchande : vérifier l'éligibilité de votre compte avant activation.
 * Doc : https://docs.wave.com/checkout
 */
const API = "https://api.wave.com/v1";

export function waveSignatureValid(header: string | null, rawBody: string, secret: string): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sigs = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || sigs.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > 300) return false; // anti-rejeu : 5 minutes
  const expected = hmacHex(secret, t + rawBody);
  return sigs.some((s) => safeEqual(expected, s));
}

export const wave: PaymentProvider = {
  id: "wave",
  label: "Wave",
  description: "Paiement avec l'application Wave (selon disponibilité dans votre pays).",
  async isConfigured() {
    return !!(await getSecret("payments.wave.apiKey"));
  },
  async initiate(input) {
    const key = await getSecret("payments.wave.apiKey");
    const res = await fetch(`${API}/checkout/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": input.reference },
      body: JSON.stringify({
        amount: String(input.amount),
        currency: "XOF",
        client_reference: input.reference,
        success_url: input.returnUrl,
        error_url: input.cancelUrl,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; wave_launch_url?: string; message?: string };
    if (!res.ok || !json.wave_launch_url || !json.id) throw new Error(`Wave : ${json.message || "initialisation refusée"}`);
    return { redirectUrl: json.wave_launch_url, providerRef: json.id };
  },
  async verify(order) {
    const key = await getSecret("payments.wave.apiKey");
    if (!order.providerRef) return { status: "PENDING", raw: { error: "session Wave manquante" } };
    const res = await fetch(`${API}/checkout/sessions/${encodeURIComponent(order.providerRef)}`, { headers: { Authorization: `Bearer ${key}` } });
    const json = (await res.json().catch(() => ({}))) as { payment_status?: string; checkout_status?: string; amount?: string; currency?: string; client_reference?: string; transaction_id?: string };
    if (json.client_reference && json.client_reference !== order.reference) return { status: "FAILED", raw: { error: "référence incohérente" } };
    return {
      status: json.payment_status === "succeeded" ? "PAID" : json.checkout_status === "expired" || json.payment_status === "cancelled" ? "FAILED" : "PENDING",
      amount: json.amount !== undefined ? Number(json.amount) : undefined,
      currency: json.currency,
      providerRef: order.providerRef,
      raw: json,
    };
  },
  async parseWebhook({ headers, rawBody }) {
    const secret = await getSecret("payments.wave.webhookSecret");
    if (!secret || !waveSignatureValid(headers.get("wave-signature"), rawBody, secret)) return null;
    const body = JSON.parse(rawBody) as { data?: { client_reference?: string; id?: string } };
    return { reference: body.data?.client_reference ?? null, providerRef: body.data?.id ?? null, signatureChecked: true };
  },
};
