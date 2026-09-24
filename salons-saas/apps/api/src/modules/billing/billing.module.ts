import { Module } from '@nestjs/common';
import { BillingEngine } from './billing-engine.service';
import { BillingNotifier } from './billing-notifier.service';
import { BillingController } from './billing.controller';
import { BillingScheduler } from './billing.scheduler';
import { BillingService } from './billing.service';
import { paymentGatewayProvider } from './gateways/gateway.provider';

@Module({
  controllers: [BillingController],
  providers: [BillingEngine, BillingNotifier, BillingService, BillingScheduler, paymentGatewayProvider],
  exports: [BillingEngine, BillingService],
})
export class BillingModule {}
