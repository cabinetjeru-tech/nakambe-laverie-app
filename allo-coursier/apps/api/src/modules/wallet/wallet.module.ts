import { Global, Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Global()
@Module({
  controllers: [WalletController],
  providers: [LedgerService, WalletService],
  exports: [LedgerService],
})
export class WalletModule {}
