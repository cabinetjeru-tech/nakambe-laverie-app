export interface GatewayInvoiceItem {
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface GatewayCreateCheckoutParams {
  amount: number;
  description: string;
  items: GatewayInvoiceItem[];
  externalId: string;
  customerFirstname: string;
  customerLastname: string;
  customerEmail?: string;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  customData?: Record<string, string>;
}

export interface GatewayCheckoutResult {
  token: string;
  paymentUrl: string;
  raw: Record<string, unknown>;
}

export interface GatewayStatusResult {
  token: string;
  status: string;
  amount?: number;
  operatorName?: string;
  transactionId?: string;
  raw: Record<string, unknown>;
}

/** Contrat commun implémenté par chaque agrégateur de paiement (LigdiCash, CinetPay, ...). */
export interface PaymentGateway {
  createCheckout(params: GatewayCreateCheckoutParams): Promise<GatewayCheckoutResult>;
  confirmTransaction(token: string): Promise<GatewayStatusResult>;
}
