import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

export interface LigdicashInvoiceItem {
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface LigdicashCreateCheckoutParams {
  amount: number;
  description: string;
  items: LigdicashInvoiceItem[];
  externalId: string;
  customerFirstname: string;
  customerLastname: string;
  customerEmail?: string;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  customData?: Record<string, string>;
}

export interface LigdicashCheckoutResult {
  token: string;
  paymentUrl: string;
  raw: Record<string, unknown>;
}

export interface LigdicashStatusResult {
  token: string;
  status: string;
  amount?: number;
  operatorName?: string;
  transactionId?: string;
  raw: Record<string, unknown>;
}

@Injectable()
export class LigdicashService {
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

  async createCheckout(params: LigdicashCreateCheckoutParams): Promise<LigdicashCheckoutResult> {
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

    const response = await fetch(`${this.baseUrl}redirect/checkout-invoice/create`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok || data.response_code !== '00' || !data.token || !data.response_text) {
      throw new BadGatewayException(
        `LigdiCash a refusé la demande de paiement : ${(data.description as string) ?? response.statusText}`,
      );
    }

    return {
      token: data.token as string,
      paymentUrl: data.response_text as string,
      raw: data,
    };
  }

  async confirmTransaction(token: string): Promise<LigdicashStatusResult> {
    const response = await fetch(
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
