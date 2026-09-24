import { BadGatewayException, Logger } from '@nestjs/common';
import { CheckoutRequest, CheckoutResult, PaymentGateway, VerificationResult } from './payment-gateway';

const PAYMENT_URL = 'https://api-checkout.cinetpay.com/v2/payment';
const CHECK_URL = 'https://api-checkout.cinetpay.com/v2/payment/check';

/**
 * CinetPay (Mobile Money Orange / Moov, cartes) — API Checkout v2.
 * Repris du connecteur de la plateforme laverie (backend/src/modules/online-payments),
 * adapté à l'interface PaymentGateway. Nécessite un compte marchand (KYC) : non testé contre
 * l'API réelle ici, les tests utilisent le simulateur.
 */
export class CinetpayGateway implements PaymentGateway {
  readonly name = 'cinetpay';
  private readonly logger = new Logger(CinetpayGateway.name);

  constructor(
    private readonly apiKey: string,
    private readonly siteId: string,
  ) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const data = await this.post(PAYMENT_URL, {
      apikey: this.apiKey,
      site_id: this.siteId,
      transaction_id: request.transactionId,
      amount: Number(request.amount),
      currency: request.currency,
      description: request.description.slice(0, 200),
      customer_name: request.customerName,
      customer_surname: request.customerName,
      customer_phone_number: request.customerPhone ?? undefined,
      notify_url: request.notifyUrl,
      return_url: request.returnUrl,
      channels: 'ALL',
    });
    const checkoutUrl = (data.data as Record<string, unknown> | undefined)?.payment_url as string | undefined;
    if (data.code !== '201' || !checkoutUrl) {
      throw new BadGatewayException(`CinetPay a refusé la demande de paiement : ${String(data.description ?? data.message ?? 'erreur')}`);
    }
    return { checkoutUrl, raw: data };
  }

  async verify(transactionId: string): Promise<VerificationResult> {
    const data = await this.post(CHECK_URL, { apikey: this.apiKey, site_id: this.siteId, transaction_id: transactionId });
    const inner = (data.data as Record<string, unknown> | undefined) ?? {};
    const status = String(inner.status ?? '').toUpperCase();
    return {
      // « 00 » + ACCEPTED = payé ; REFUSED/CANCELED = échec ; le reste = en attente.
      status: data.code === '00' && status === 'ACCEPTED' ? 'SUCCEEDED' : ['REFUSED', 'CANCELED', 'CANCELLED'].includes(status) ? 'FAILED' : 'PENDING',
      amount: inner.amount !== undefined ? Number(inner.amount) : undefined,
      currency: inner.currency as string | undefined,
      operator: inner.payment_method as string | undefined,
      raw: data,
    };
  }

  private async post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.error(`CinetPay injoignable : ${(error as Error).message}`);
      throw new BadGatewayException('Le service de paiement en ligne est momentanément indisponible. Réessayez ou payez par Mobile Money.');
    }
    const text = await response.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.logger.error(`Réponse CinetPay illisible (HTTP ${response.status}) : ${text.slice(0, 300)}`);
      throw new BadGatewayException('Réponse inattendue du service de paiement.');
    }
  }
}
