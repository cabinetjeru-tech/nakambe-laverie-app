import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { NumberingService } from '../../common/numbering.service';
import { DocumentsModule } from '../../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  providers: [InvoicesService, NumberingService],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
