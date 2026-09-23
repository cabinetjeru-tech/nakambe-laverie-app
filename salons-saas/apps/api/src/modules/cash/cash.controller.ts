import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { CashService } from './cash.service';
import { CashMovementDto, CloseSessionDto, CreateSaleDto, OpenSessionDto, SalesQueryDto, SalonQueryDto, SessionsQueryDto, VoidSaleDto } from './dto/cash.dto';
import { SalesService } from './sales.service';

@Controller()
export class CashController {
  constructor(
    private readonly cash: CashService,
    private readonly sales: SalesService,
  ) {}

  // ------------------------------------------------------------------ Sessions de caisse

  @RequireAnyPermission('cash.read', 'cash.session.open_close', 'sales.create')
  @Get('cash/current')
  current(@CurrentUser() user: AuthUser, @Query() query: SalonQueryDto) {
    return this.cash.current(user, query.salonId);
  }

  @RequireAnyPermission('cash.read', 'cash.session.open_close')
  @Get('cash/sessions')
  sessions(@CurrentUser() user: AuthUser, @Query() query: SessionsQueryDto) {
    return this.cash.list(user, query.salonId);
  }

  @RequireAnyPermission('cash.read', 'cash.session.open_close')
  @Get('cash/sessions/:id')
  session(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.cash.get(user, id);
  }

  @RequirePermissions('cash.session.open_close')
  @Post('cash/sessions')
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenSessionDto) {
    return this.cash.open(user, dto);
  }

  @RequirePermissions('cash.session.open_close')
  @HttpCode(HttpStatus.OK)
  @Post('cash/sessions/:id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: CloseSessionDto) {
    return this.cash.close(user, id, dto);
  }

  @RequirePermissions('cash.movements.manage')
  @Post('cash/movements')
  movement(@CurrentUser() user: AuthUser, @Body() dto: CashMovementDto) {
    return this.cash.movement(user, dto);
  }

  // ------------------------------------------------------------------ Ventes

  @RequireAnyPermission('sales.create', 'cash.read', 'reports.read')
  @Get('sales')
  list(@CurrentUser() user: AuthUser, @Query() query: SalesQueryDto) {
    return this.sales.list(user, query);
  }

  @RequireAnyPermission('sales.create', 'cash.read', 'reports.read')
  @Get('sales/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.sales.get(user, id);
  }

  @RequirePermissions('sales.create', 'payments.record')
  @Post('sales')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.sales.create(user, dto);
  }

  @RequirePermissions('sales.void')
  @HttpCode(HttpStatus.OK)
  @Post('sales/:id/void')
  void(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: VoidSaleDto) {
    return this.sales.void(user, id, dto.reason);
  }

  @RequirePermissions('payments.validate')
  @Get('payments/pending')
  pending(@CurrentUser() user: AuthUser, @Query() query: SessionsQueryDto) {
    return this.sales.pendingPayments(user, query.salonId);
  }

  @RequirePermissions('payments.validate')
  @HttpCode(HttpStatus.OK)
  @Post('payments/:id/validate')
  validate(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.sales.validatePayment(user, id, true);
  }

  @RequirePermissions('payments.validate')
  @HttpCode(HttpStatus.OK)
  @Post('payments/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.sales.validatePayment(user, id, false);
  }
}
