import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { EngagementController } from './engagement.controller';
import { NumberingService } from '../../common/numbering.service';

@Module({
  providers: [EngagementService, NumberingService],
  controllers: [EngagementController],
})
export class EngagementModule {}
