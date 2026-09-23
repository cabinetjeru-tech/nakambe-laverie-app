import { LedgerAccount } from '@prisma/client';

/** Compte du registre crédité/débité selon le moyen de paiement. */
export function accountForPaymentMethod(method: string): LedgerAccount {
  switch (method) {
    case 'CASH':
      return 'CASH';
    case 'MOBILE_MONEY_MANUAL':
    case 'MOBILE_MONEY':
      return 'MOBILE_MONEY';
    case 'CINETPAY':
    case 'LIGDICASH':
    case 'CARD':
      return 'PROVIDER_CLEARING';
    case 'BANK_TRANSFER':
    case 'CHEQUE':
      return 'BANK';
    case 'CLIENT_CREDIT':
      return 'CLIENT_CREDIT';
    case 'GIFT_CARD':
      return 'GIFT_CARD_LIABILITY';
    default:
      // Dépense réglée par un autre moyen (poche du propriétaire…).
      return 'OWNER_EQUITY';
  }
}
