import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';
import { OpenSessionService } from './open-session.service';
import { SalesService } from './sales.service';

@Module({
  imports: [StockModule],
  controllers: [CashController],
  providers: [CashService, SalesService, OpenSessionService],
})
export class CashModule {}
