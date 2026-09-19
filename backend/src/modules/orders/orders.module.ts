import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { NumberingService } from '../../common/numbering.service';
import { AuditLogService } from '../../common/audit-log.service';

@Module({
  providers: [OrdersService, NumberingService, AuditLogService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
