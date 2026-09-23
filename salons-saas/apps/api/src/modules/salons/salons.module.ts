import { Module } from '@nestjs/common';
import { SalonsController } from './salons.controller';
import { SalonsService } from './salons.service';

@Module({
  controllers: [SalonsController],
  providers: [SalonsService],
})
export class SalonsModule {}
