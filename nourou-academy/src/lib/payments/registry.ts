import "server-only";
import { getPaymentSettings } from "../settings";
import { cinetpay } from "./providers/cinetpay";
import { paydunya } from "./providers/paydunya";
import { wave } from "./providers/wave";
import { demo } from "./providers/demo";
import type { PaymentProvider, ProviderId } from "./types";

const all: Record<ProviderId, PaymentProvider> = { cinetpay, paydunya, wave, demo };

export function getProvider(id: string): PaymentProvider | null {
  return (all as Record<string, PaymentProvider>)[id] ?? null;
}

/** Prestataires activés par l'administration ET correctement configurés. */
export async function availableProviders(): Promise<{ id: ProviderId; label: string; description: string }[]> {
  const s = await getPaymentSettings();
  const out: { id: ProviderId; label: string; description: string }[] = [];
  for (const id of ["cinetpay", "paydunya", "wave"] as const) {
    if (s.enabled.includes(id) && (await all[id].isConfigured())) out.push({ id, label: all[id].label, description: all[id].description });
  }
  if (await demo.isConfigured()) out.push({ id: "demo", label: demo.label, description: demo.description });
  return out;
}
