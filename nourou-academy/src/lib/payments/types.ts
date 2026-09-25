export type ProviderId = "demo" | "cinetpay" | "paydunya" | "wave";

export type InitiateInput = {
  reference: string;
  amount: number; // XOF
  description: string;
  customer: { name: string; email: string; phone?: string | null };
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};

export type InitiateResult = { redirectUrl: string; providerRef?: string };

/** Résultat d'une vérification serveur-à-serveur auprès du prestataire. */
export type VerifyResult = {
  status: "PAID" | "PENDING" | "FAILED";
  amount?: number;
  currency?: string;
  providerRef?: string;
  raw: unknown;
};

export interface PaymentProvider {
  id: ProviderId;
  label: string;
  description: string;
  isConfigured(): Promise<boolean>;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  /** Interroge le prestataire : SEULE preuve de paiement acceptée. */
  verify(order: { reference: string; providerRef: string | null }): Promise<VerifyResult>;
  /**
   * Authentifie une notification (webhook/IPN) et en extrait la référence de commande.
   * Renvoie null si la signature est invalide.
   */
  parseWebhook(req: { headers: Headers; rawBody: string }): Promise<{ reference: string | null; providerRef?: string | null; signatureChecked: boolean } | null>;
}
