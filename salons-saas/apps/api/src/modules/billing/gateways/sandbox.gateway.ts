import { CheckoutRequest, CheckoutResult, PaymentGateway, VerificationResult } from './payment-gateway';

interface SandboxTransaction {
  amount: bigint;
  currency: string;
  outcome: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  paidAmount?: bigint;
}

/**
 * Simulateur d'agrégateur (développement et tests ; refusé en production par la
 * configuration). La page de paiement simulée (`/abonnement/paiement-test`) choisit l'issue,
 * puis déclenche la même notification qu'un vrai agrégateur.
 */
export class SandboxGateway implements PaymentGateway {
  readonly name = 'sandbox';
  private readonly transactions = new Map<string, SandboxTransaction>();

  constructor(private readonly appPublicUrl: string) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    this.transactions.set(request.transactionId, { amount: request.amount, currency: request.currency, outcome: 'PENDING' });
    const url =
      `${this.appPublicUrl}/abonnement/paiement-test?transaction=${encodeURIComponent(request.transactionId)}` +
      `&montant=${request.amount}&retour=${encodeURIComponent(request.returnUrl)}`;
    return { checkoutUrl: url, raw: { sandbox: true } };
  }

  async verify(transactionId: string): Promise<VerificationResult> {
    const tx = this.transactions.get(transactionId);
    if (!tx) return { status: 'FAILED', raw: { sandbox: true, error: 'transaction inconnue' } };
    return {
      status: tx.outcome,
      amount: Number(tx.paidAmount ?? tx.amount),
      currency: tx.currency,
      operator: 'Simulateur',
      raw: { sandbox: true, outcome: tx.outcome },
    };
  }

  /** Issue choisie sur la page simulée (paidAmount permet de tester un montant falsifié). */
  settle(transactionId: string, outcome: 'SUCCEEDED' | 'FAILED', paidAmount?: bigint): boolean {
    const tx = this.transactions.get(transactionId);
    if (!tx) return false;
    tx.outcome = outcome;
    tx.paidAmount = paidAmount;
    return true;
  }
}
