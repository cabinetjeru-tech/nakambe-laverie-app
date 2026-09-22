import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { QuotesModule } from '../quotes/quotes.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [QuotesModule, PushNotificationsModule],
  providers: [AppointmentsService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
