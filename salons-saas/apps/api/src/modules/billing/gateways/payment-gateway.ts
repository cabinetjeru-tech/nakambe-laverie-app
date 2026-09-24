export interface CheckoutRequest {
  /** Identifiant de transaction généré par nous (sert de jeton de suivi chez l'agrégateur). */
  transactionId: string;
  amount: bigint;
  currency: string;
  description: string;
  customerName: string;
  customerPhone?: string | null;
  returnUrl: string;
  notifyUrl: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
  raw: Record<string, unknown>;
}

export type GatewayStatus = 'SUCCEEDED' | 'FAILED' | 'PENDING';

export interface VerificationResult {
  status: GatewayStatus;
  amount?: number;
  currency?: string;
  operator?: string;
  raw: Record<string, unknown>;
}

/**
 * Agrégateur de paiement en ligne. La confirmation d'un paiement ne repose JAMAIS sur le
 * contenu d'une notification reçue : on interroge toujours l'agrégateur (`verify`), puis on
 * contrôle montant et devise avant de valider la facture.
 */
export interface PaymentGateway {
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  verify(transactionId: string): Promise<VerificationResult>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
