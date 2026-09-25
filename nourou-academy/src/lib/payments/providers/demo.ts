import "server-only";
import { env } from "../../env";
import type { PaymentProvider } from "../types";

/**
 * Prestataire de DÉMONSTRATION — aucun argent réel.
 * - Désactivé automatiquement quand APP_ENV=production.
 * - Les commandes sont marquées mode=DEMO, exclues des statistiques de chiffre d'affaires
 *   et les factures portent la mention « DÉMONSTRATION — SANS VALEUR ».
 */
export const demo: PaymentProvider = {
  id: "demo",
  label: "Paiement de démonstration",
  description: "Mode test : aucun débit réel. Réservé aux environnements de développement.",
  async isConfigured() {
    return env.paymentDemoEnabled;
  },
  async initiate(input) {
    if (!env.paymentDemoEnabled) throw new Error("Mode démonstration désactivé.");
    return { redirectUrl: `/paiement/demo/${encodeURIComponent(input.reference)}` };
  },
  async verify() {
    // La confirmation d'une commande de démonstration se fait uniquement via l'écran de démonstration.
    return { status: "PENDING", raw: { demo: true } };
  },
  async parseWebhook() {
    return null;
  },
};
