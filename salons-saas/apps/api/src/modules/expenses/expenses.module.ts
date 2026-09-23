import { Module } from '@nestjs/common';
import { OpenSessionService } from '../cash/open-session.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, OpenSessionService],
})
export class ExpensesModule {}
