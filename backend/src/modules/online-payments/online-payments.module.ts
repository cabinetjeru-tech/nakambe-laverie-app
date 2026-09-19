import { Module } from '@nestjs/common';
import { OnlinePaymentsService } from './online-payments.service';
import { OnlinePaymentsController } from './online-payments.controller';
import { LigdicashService } from './ligdicash.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  providers: [OnlinePaymentsService, LigdicashService],
  controllers: [OnlinePaymentsController],
  exports: [OnlinePaymentsService],
})
export class OnlinePaymentsModule {}
