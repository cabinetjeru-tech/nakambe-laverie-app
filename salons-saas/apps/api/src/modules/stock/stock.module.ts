import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockLedgerService } from './stock-ledger.service';
import { StockService } from './stock.service';

@Module({
  controllers: [StockController],
  providers: [StockService, StockLedgerService],
  exports: [StockLedgerService],
})
export class StockModule {}
