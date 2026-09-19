import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { NumberingService } from '../../common/numbering.service';
import { DocumentsModule } from '../../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  providers: [QuotesService, NumberingService],
  controllers: [QuotesController],
  exports: [QuotesService],
})
export class QuotesModule {}
