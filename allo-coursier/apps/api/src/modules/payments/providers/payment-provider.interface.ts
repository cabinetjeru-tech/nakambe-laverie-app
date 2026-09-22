import { PaymentProvider } from '@prisma/client';

/** Informations affichées au client pour choisir et effectuer un paiement. */
export interface PaymentMethodInfo {
  code: PaymentProvider;
  label: string;
  enabled: boolean;
  /** Paiement confirmé immédiatement (portefeuille) ou après vérification (Mobile Money manuel). */
  confirmation: 'IMMEDIATE' | 'ON_DELIVERY' | 'MANUAL_REVIEW' | 'PROVIDER_CALLBACK';
  instructions?: string;
  accounts?: { operator: string; number: string }[];
}

export interface InitiatePaymentInput {
  paymentId: string;
  amount: number;
  currency: 'XOF';
  payerPhone: string;
  description: string;
}

export interface InitiatePaymentResult {
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  providerReference?: string;
  /** Action demandée au client (ex. valider sur son téléphone via le menu USSD de l'opérateur). */
  customerAction?: string;
}

/**
 * Contrat commun des moyens de paiement. Les connecteurs d'opérateurs (Orange Money, Moov Money)
 * ou d'agrégateurs s'ajoutent en implémentant cette interface, avec la documentation officielle
 * fournie à la signature du contrat marchand ; aucune API n'est supposée ici.
 */
export interface PaymentProviderAdapter {
  readonly code: PaymentProvider;
  describe(): Promise<PaymentMethodInfo>;
  /** Paiements « poussés » vers l'opérateur. Absent pour espèces, portefeuille et Mobile Money manuel. */
  initiate?(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  /** Vérifie la signature d'une notification de l'opérateur et en extrait le résultat. */
  handleWebhook?(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<{ providerReference: string; status: 'SUCCEEDED' | 'FAILED' }>;
}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
