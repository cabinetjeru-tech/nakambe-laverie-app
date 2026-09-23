import { Injectable, NotImplementedException } from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { SettingsService } from '../../settings/settings.service';
import { InitiatePaymentResult, PaymentMethodInfo, PaymentProviderAdapter } from './payment-provider.interface';

@Injectable()
export class CashProvider implements PaymentProviderAdapter {
  readonly code = PaymentProvider.CASH;
  async describe(): Promise<PaymentMethodInfo> {
    return {
      code: this.code,
      label: 'Espèces',
      enabled: true,
      confirmation: 'ON_DELIVERY',
      instructions: 'Payez le livreur au ramassage ou à la livraison, selon votre choix.',
    };
  }
}

@Injectable()
export class WalletProvider implements PaymentProviderAdapter {
  readonly code = PaymentProvider.WALLET;
  async describe(): Promise<PaymentMethodInfo> {
    return {
      code: this.code,
      label: 'Portefeuille Allô-Coursier',
      enabled: true,
      confirmation: 'IMMEDIATE',
      instructions: 'Le montant est débité de votre solde. Rechargez-le par Mobile Money.',
    };
  }
}

/** Mobile Money sans contrat opérateur : transfert au numéro de l'entreprise + référence vérifiée par l'équipe. */
@Injectable()
export class ManualMobileMoneyProvider implements PaymentProviderAdapter {
  readonly code = PaymentProvider.MANUAL_MOBILE_MONEY;
  constructor(private settings: SettingsService) {}

  async describe(): Promise<PaymentMethodInfo> {
    const orange = await this.settings.get('payments.mobileMoney.orangeNumber');
    const moov = await this.settings.get('payments.mobileMoney.moovNumber');
    const accounts = [
      ...(orange ? [{ operator: 'ORANGE', number: orange }] : []),
      ...(moov ? [{ operator: 'MOOV', number: moov }] : []),
    ];
    return {
      code: this.code,
      label: 'Orange Money / Moov Money',
      enabled: accounts.length > 0,
      confirmation: 'MANUAL_REVIEW',
      instructions:
        'Envoyez le montant exact au numéro indiqué depuis votre téléphone, puis saisissez la référence reçue par SMS. ' +
        'Ne communiquez jamais votre code secret Mobile Money.',
      accounts,
    };
  }
}

/**
 * Emplacement des connecteurs directs. À compléter avec la documentation officielle remise par
 * l'opérateur (ou l'agrégateur) lors de la signature du contrat marchand.
 */
abstract class OperatorProviderPlaceholder implements PaymentProviderAdapter {
  abstract readonly code: PaymentProvider;
  abstract readonly label: string;
  async describe(): Promise<PaymentMethodInfo> {
    return { code: this.code, label: this.label, enabled: false, confirmation: 'PROVIDER_CALLBACK' };
  }
  async initiate(): Promise<InitiatePaymentResult> {
    throw new NotImplementedException(`${this.label} : connecteur non activé (contrat marchand requis).`);
  }
}

@Injectable()
export class OrangeMoneyProvider extends OperatorProviderPlaceholder {
  readonly code = PaymentProvider.ORANGE_MONEY;
  readonly label = 'Orange Money (paiement direct)';
}

@Injectable()
export class MoovMoneyProvider extends OperatorProviderPlaceholder {
  readonly code = PaymentProvider.MOOV_MONEY;
  readonly label = 'Moov Money (paiement direct)';
}
