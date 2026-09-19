import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { NumberingService } from '../../common/numbering.service';
import { AuditLogService } from '../../common/audit-log.service';

@Module({
  providers: [ClientsService, NumberingService, AuditLogService],
  controllers: [ClientsController],
  exports: [ClientsService],
})
export class ClientsModule {}
