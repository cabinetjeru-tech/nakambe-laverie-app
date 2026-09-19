import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { FinanceService } from './finance.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('finance')
@Roles(RoleName.ADMIN, RoleName.GERANT)
@Controller('finance')
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  @Post('expenses')
  createExpense(@Body() dto: any) {
    return this.financeService.createExpense(dto);
  }

  @Get('expenses')
  findExpenses(@Query('from') from?: string, @Query('to') to?: string) {
    return this.financeService.findExpenses(from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Post('revenues')
  createRevenue(@Body() dto: any) {
    return this.financeService.createRevenue(dto);
  }

  @Get('revenues')
  findRevenues(@Query('from') from?: string, @Query('to') to?: string) {
    return this.financeService.findRevenues(from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get('summary')
  summary(@Query('from') from: string, @Query('to') to: string) {
    return this.financeService.summary(new Date(from), new Date(to));
  }
}
