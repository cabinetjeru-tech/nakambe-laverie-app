import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { PeriodQuery } from '../../common/pagination';
import { resolvePeriod } from '../../common/period';
import { CancelDto, CreateExpenseDto, CreateIncomeDto, FinanceService, PayDto } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private s: FinanceService) {}

  @Get('expense-categories') @RequirePermissions('expenses.view', 'expenses.manage')
  categories() { return this.s.categories(); }

  @Get('expenses') @RequirePermissions('expenses.view')
  expenses(@Query() q: { from?: string; to?: string; categoryId?: string; status?: string; search?: string }) { return this.s.listExpenses(q); }
  @Post('expenses') @RequirePermissions('expenses.manage')
  createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.createExpense(dto, u, ip); }
  @Post('expenses/:id/pay') @RequirePermissions('expenses.manage')
  payExpense(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.payExpense(id, dto, u, ip); }
  @Post('expenses/:id/cancel') @RequirePermissions('expenses.manage')
  cancelExpense(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.cancelExpense(id, dto, u, ip); }

  @Get('incomes') @RequirePermissions('expenses.view')
  incomes(@Query() q: { from?: string; to?: string }) { return this.s.listIncomes(q); }
  @Post('incomes') @RequirePermissions('expenses.manage')
  createIncome(@Body() dto: CreateIncomeDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.createIncome(dto, u, ip); }
  @Post('incomes/:id/cancel') @RequirePermissions('expenses.manage')
  cancelIncome(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.cancelIncome(id, dto, u, ip); }

  @Get('summary') @RequirePermissions('finance.view')
  summary(@Query() q: PeriodQuery) { return this.s.summary(resolvePeriod(q)); }
  @Get('treasury') @RequirePermissions('finance.view')
  treasury() { return this.s.treasury(); }
  @Get('receivables') @RequirePermissions('finance.view', 'sales.view')
  receivables() { return this.s.receivables(); }
  @Get('payables') @RequirePermissions('finance.view', 'suppliers.manage')
  payables() { return this.s.payables(); }
  @Get('income-journal') @RequirePermissions('finance.view')
  incomeJournal(@Query() q: PeriodQuery) { return this.s.incomeJournal(resolvePeriod(q)); }
}

@Module({ controllers: [FinanceController], providers: [FinanceService], exports: [FinanceService] })
export class FinanceModule {}
