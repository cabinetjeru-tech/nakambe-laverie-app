import { Provider } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../../config/env';
import { CinetpayGateway } from './cinetpay.gateway';
import { PAYMENT_GATEWAY, PaymentGateway } from './payment-gateway';
import { SandboxGateway } from './sandbox.gateway';

/** Agrégateur choisi par PAYMENT_PROVIDER ; null = paiement en ligne désactivé (Mobile Money manuel seul). */
export const paymentGatewayProvider: Provider = {
  provide: PAYMENT_GATEWAY,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): PaymentGateway | null => {
    switch (config.PAYMENT_PROVIDER) {
      case 'cinetpay':
        return new CinetpayGateway(config.CINETPAY_API_KEY, config.CINETPAY_SITE_ID);
      case 'sandbox':
        return new SandboxGateway(config.APP_PUBLIC_URL);
      default:
        return null;
    }
  },
};
