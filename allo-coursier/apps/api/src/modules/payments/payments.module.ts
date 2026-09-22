import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDERS } from './providers/payment-provider.interface';
import { CashProvider, ManualMobileMoneyProvider, MoovMoneyProvider, OrangeMoneyProvider, WalletProvider } from './providers/providers';

const PROVIDER_CLASSES = [CashProvider, WalletProvider, ManualMobileMoneyProvider, OrangeMoneyProvider, MoovMoneyProvider];

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    ...PROVIDER_CLASSES,
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (...providers: unknown[]) => providers,
      inject: PROVIDER_CLASSES,
    },
    PaymentsService,
  ],
})
export class PaymentsModule {}
