import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { AdminOrdersService } from './admin-orders.service';
import { DispatchService } from './dispatch.service';
import { AdminOrderQueryDto, AdminStatusDto, AssignDriverDto, CancelOrderDto } from './dto/orders.dto';
import { FINAL_STATUSES } from './order-status';
import { OrdersService } from './orders.service';

class LiveQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;
}

@ApiTags('Administration — Commandes')
@ApiBearerAuth()
@Controller('admin')
export class AdminOrdersController {
  constructor(
    private admin: AdminOrdersService,
    private dispatch: DispatchService,
    private orders: OrdersService,
  ) {}

  @Get('orders')
  @RequirePermissions(PERMISSIONS.ORDERS_READ.code)
  list(@Query() query: AdminOrderQueryDto, @CurrentUser() user: AuthUser) {
    return this.admin.list(query, user);
  }

  @Get('orders/:id')
  @RequirePermissions(PERMISSIONS.ORDERS_READ.code)
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.admin.detail(id, user);
  }

  @HttpCode(200)
  @Post('orders/:id/assign')
  @RequirePermissions(PERMISSIONS.ORDERS_ASSIGN.code)
  async assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDriverDto, @CurrentUser() user: AuthUser) {
    await this.admin.assertAccess(id, user);
    await this.dispatch.adminAssign(id, dto.driverId, user.id);
    return this.admin.detail(id, user);
  }

  @HttpCode(200)
  @Post('orders/:id/redispatch')
  @RequirePermissions(PERMISSIONS.ORDERS_ASSIGN.code)
  async redispatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.admin.assertAccess(id, user);
    await this.dispatch.redispatch(id, { id: user.id, role: 'STAFF' });
    return this.admin.detail(id, user);
  }

  @HttpCode(200)
  @Post('orders/:id/cancel')
  @RequirePermissions(PERMISSIONS.ORDERS_MANAGE.code)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto, @CurrentUser() user: AuthUser) {
    await this.admin.assertAccess(id, user);
    const cancellable = Object.values(OrderStatus).filter((s) => !FINAL_STATUSES.includes(s));
    await this.orders.cancel(id, cancellable, { id: user.id, role: 'STAFF' }, dto.reason);
    return this.admin.detail(id, user);
  }

  @HttpCode(200)
  @Post('orders/:id/status')
  @RequirePermissions(PERMISSIONS.ORDERS_MANAGE.code)
  forceStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminStatusDto, @CurrentUser() user: AuthUser) {
    return this.admin.forceStatus(id, dto, user);
  }

  @Get('live')
  @RequirePermissions(PERMISSIONS.ORDERS_READ.code)
  live(@Query() query: LiveQueryDto, @CurrentUser() user: AuthUser) {
    return this.admin.live(user, query.cityId);
  }
}
