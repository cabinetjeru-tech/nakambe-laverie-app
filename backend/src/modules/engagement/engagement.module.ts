import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { EngagementController } from './engagement.controller';
import { NumberingService } from '../../common/numbering.service';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [PushNotificationsModule],
  providers: [EngagementService, NumberingService],
  controllers: [EngagementController],
})
export class EngagementModule {}
