import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { CreateExpenseDto, DeleteExpenseDto, ExpenseCategoryDto, ExpenseQueryDto } from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

@Controller()
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @RequireAnyPermission('expenses.create', 'expenses.manage')
  @Get('expense-categories')
  categories() {
    return this.expenses.categories();
  }

  @RequirePermissions('expenses.manage')
  @Post('expense-categories')
  createCategory(@Body() dto: ExpenseCategoryDto) {
    return this.expenses.createCategory(dto);
  }

  @RequireAnyPermission('expenses.create', 'expenses.manage')
  @Get('expenses')
  list(@CurrentUser() user: AuthUser, @Query() query: ExpenseQueryDto) {
    return this.expenses.list(user, query);
  }

  @RequireAnyPermission('expenses.create', 'expenses.manage')
  @Post('expenses')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user, dto);
  }

  /** DELETE avec corps : le motif est obligatoire. */
  @RequirePermissions('expenses.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('expenses/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: DeleteExpenseDto) {
    return this.expenses.remove(user, id, dto.reason);
  }
}
