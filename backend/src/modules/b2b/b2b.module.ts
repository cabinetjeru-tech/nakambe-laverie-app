import { Module } from '@nestjs/common';
import { B2bService } from './b2b.service';
import { B2bController } from './b2b.controller';

@Module({
  providers: [B2bService],
  controllers: [B2bController],
})
export class B2bModule {}
