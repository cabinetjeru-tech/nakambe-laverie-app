import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { NumberingService } from '../../common/numbering.service';
import { AuditLogService } from '../../common/audit-log.service';

@Module({
  providers: [PaymentsService, NumberingService, AuditLogService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
