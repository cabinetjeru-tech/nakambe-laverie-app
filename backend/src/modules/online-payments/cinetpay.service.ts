import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { GatewayCheckoutResult, GatewayCreateCheckoutParams, GatewayStatusResult, PaymentGateway } from './payment-gateway.interface';

/**
 * Client HTTP pour l'agrégateur de paiement Mobile Money CinetPay (API Checkout v2).
 * Endpoints et champs alignés sur le SDK PHP officiel/communautaire
 * (https://github.com/cinetpay/cinetpay-php-sdk, https://github.com/cobaf/cinetpay-sdk-php).
 */

const PAYMENT_URL = 'https://api-checkout.cinetpay.com/v2/payment';
const CHECK_URL = 'https://api-checkout.cinetpay.com/v2/payment/check';

@Injectable()
export class CinetpayService implements PaymentGateway {
  private readonly logger = new Logger(CinetpayService.name);

  constructor(private config: ConfigService) {}

  private get credentials() {
    return {
      apikey: this.config.get<string>('CINETPAY_API_KEY') ?? '',
      site_id: this.config.get<string>('CINETPAY_SITE_ID') ?? '',
    };
  }

  /** Convertit une panne réseau (DNS, timeout, connexion refusée) en erreur propre plutôt qu'un 500 brut. */
  private async safeFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err) {
      const cause = (err as { cause?: unknown })?.cause;
      this.logger.error(
        `Impossible de joindre CinetPay (${url}) : ${(err as Error).message} — cause : ${cause instanceof Error ? `${cause.name}: ${cause.message}` : JSON.stringify(cause)}`,
      );
      throw new BadGatewayException("Impossible de joindre le serveur de paiement CinetPay pour le moment. Réessayez dans un instant.");
    }
  }

  async createCheckout(params: GatewayCreateCheckoutParams): Promise<GatewayCheckoutResult> {
    // CinetPay ne renvoie pas d'identifiant de transaction : c'est le marchand qui le génère
    // et le fournit dès la création — on l'utilise ensuite comme jeton de suivi interne.
    const transactionId = `NK-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const body = {
      ...this.credentials,
      transaction_id: transactionId,
      amount: Math.round(params.amount),
      currency: 'XOF',
      description: params.description,
      customer_name: params.customerLastname,
      customer_surname: params.customerFirstname,
      customer_email: params.customerEmail,
      notify_url: params.callbackUrl,
      return_url: params.returnUrl,
      channels: 'ALL',
      metadata: params.externalId,
    };

    const response = await this.safeFetch(PAYMENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const rawText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      // réponse non-JSON, conservée dans rawText pour le diagnostic
    }

    const paymentUrl = (data.data as Record<string, unknown> | undefined)?.payment_url as string | undefined;

    if (!response.ok || data.code !== '201' || !paymentUrl) {
      this.logger.error(
        `Échec création paiement CinetPay — HTTP ${response.status} ${response.statusText} — réponse brute : ${rawText.slice(0, 500)}`,
      );
      const detail =
        (data.description as string) || (data.message as string) || `HTTP ${response.status} ${response.statusText}`;
      throw new BadGatewayException(`CinetPay a refusé la demande de paiement : ${detail}`);
    }

    return { token: transactionId, paymentUrl, raw: data };
  }

  async confirmTransaction(token: string): Promise<GatewayStatusResult> {
    const response = await this.safeFetch(CHECK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...this.credentials, transaction_id: token }),
    });
    const rawText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      // réponse non-JSON
    }

    if (!response.ok) {
      this.logger.error(`Échec vérification transaction CinetPay ${token} — réponse brute : ${rawText.slice(0, 500)}`);
      throw new BadGatewayException(
        `Impossible de vérifier la transaction CinetPay : ${(data.message as string) ?? response.statusText}`,
      );
    }

    const inner = (data.data as Record<string, unknown> | undefined) ?? {};
    // code "00" = paiement confirmé côté CinetPay ; tout autre code = non confirmé (en attente ou refusé).
    const status = data.code === '00' ? 'completed' : ((data.message as string) ?? 'pending').toLowerCase();

    return {
      token,
      status,
      amount: inner.amount !== undefined ? Number(inner.amount) : undefined,
      operatorName: inner.payment_method as string | undefined,
      transactionId: token,
      raw: data,
    };
  }
}
