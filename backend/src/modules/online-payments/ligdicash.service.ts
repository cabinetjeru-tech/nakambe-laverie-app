import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayCheckoutResult, GatewayCreateCheckoutParams, GatewayStatusResult, PaymentGateway } from './payment-gateway.interface';

/**
 * Client HTTP pour l'agrégateur de paiement Mobile Money LigdiCash.
 * Endpoints, en-têtes et champs de charge utile alignés sur le SDK officiel
 * (https://github.com/Ligdicash/ligdicash-php) — pas de documentation publique
 * exploitable automatiquement, donc on reste au plus près du SDK de référence.
 */

const PLATFORM_BASE_URL: Record<string, string> = {
  live: 'https://app.ligdicash.com/pay/v01/',
  test: 'https://test.ligdicash.com/pay/v01/',
};

@Injectable()
export class LigdicashService implements PaymentGateway {
  private readonly logger = new Logger(LigdicashService.name);

  constructor(private config: ConfigService) {}

  private get baseUrl(): string {
    const platform = this.config.get<string>('LIGDICASH_PLATFORM') ?? 'test';
    return PLATFORM_BASE_URL[platform] ?? PLATFORM_BASE_URL.test;
  }

  private get headers(): Record<string, string> {
    return {
      Apikey: this.config.get<string>('LIGDICASH_API_KEY') ?? '',
      Authorization: `Bearer ${this.config.get<string>('LIGDICASH_AUTH_TOKEN') ?? ''}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  /** Convertit une panne réseau (DNS, timeout, connexion refusée) en erreur propre plutôt qu'un 500 brut. */
  private async safeFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err) {
      this.logger.error(`Impossible de joindre LigdiCash (${url}) : ${(err as Error).message}`);
      throw new BadGatewayException("Impossible de joindre le serveur de paiement LigdiCash pour le moment. Réessayez dans un instant.");
    }
  }

  async createCheckout(params: GatewayCreateCheckoutParams): Promise<GatewayCheckoutResult> {
    const storeName = this.config.get<string>('COMPANY_NAME') ?? 'NAKAMBÉ LAVERIE EXPRES ET DIGITALE';
    const storeUrl = this.config.get<string>('FRONTEND_URL') ?? '';

    const body = {
      commande: {
        invoice: {
          items: params.items,
          total_amount: params.amount,
          devise: 'XOF',
          description: params.description,
          customer_firstname: params.customerFirstname,
          customer_lastname: params.customerLastname,
          customer_email: params.customerEmail,
          external_id: params.externalId,
        },
        store: {
          name: storeName,
          website_url: storeUrl,
        },
        actions: {
          cancel_url: params.cancelUrl,
          return_url: params.returnUrl,
          callback_url: params.callbackUrl,
        },
        custom_data: params.customData ?? {},
      },
    };

    const response = await this.safeFetch(`${this.baseUrl}redirect/checkout-invoice/create`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    const rawText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      // réponse non-JSON, on garde rawText pour le diagnostic ci-dessous
    }

    if (!response.ok || data.response_code !== '00' || !data.token || !data.response_text) {
      this.logger.error(
        `Échec création checkout LigdiCash — HTTP ${response.status} ${response.statusText} — réponse brute : ${rawText.slice(0, 500)}`,
      );
      const detail =
        (data.description as string) ||
        (data.response_text as string) ||
        (data.message as string) ||
        `HTTP ${response.status} ${response.statusText}${!this.config.get('LIGDICASH_API_KEY') ? ' (clé API manquante côté serveur)' : ''}`;
      throw new BadGatewayException(`LigdiCash a refusé la demande de paiement : ${detail}`);
    }

    return {
      token: data.token as string,
      paymentUrl: data.response_text as string,
      raw: data,
    };
  }

  async confirmTransaction(token: string): Promise<GatewayStatusResult> {
    const response = await this.safeFetch(
      `${this.baseUrl}redirect/checkout-invoice/confirm/?invoiceToken=${encodeURIComponent(token)}`,
      { method: 'GET', headers: this.headers },
    );
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      throw new BadGatewayException(
        `Impossible de vérifier la transaction LigdiCash : ${(data.description as string) ?? response.statusText}`,
      );
    }

    return {
      token: (data.token as string) ?? token,
      status: ((data.status as string) ?? '').toLowerCase(),
      amount: data.amount !== undefined ? Number(data.amount) : undefined,
      operatorName: data.operator_name as string | undefined,
      transactionId: data.transaction_id as string | undefined,
      raw: data,
    };
  }
}
