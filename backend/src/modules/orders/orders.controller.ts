import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrderStatus, RoleName } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AssignOrderDto, UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Roles(RoleName.CLIENT, RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    const requestingClientId = user.role === RoleName.CLIENT ? user.clientId ?? undefined : undefined;
    return this.ordersService.create(dto, requestingClientId, user.userId);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Get()
  findAll(@Query('status') status?: OrderStatus, @Query('domain') domain?: string) {
    return this.ordersService.findAll({ status, domain });
  }

  @Roles(RoleName.CLIENT)
  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findAll({ clientId: user.clientId ?? undefined });
  }

  @Roles(RoleName.AGENT_LAVERIE, RoleName.AGENT_NETTOYAGE)
  @Get('assigned')
  findAssigned(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findAll({ assignedAgentId: user.userId });
  }

  @Roles(RoleName.CHAUFFEUR)
  @Get('missions')
  findMissions(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findAll({ driverId: user.userId });
  }

  @Public()
  @Get('track/:orderNumber')
  track(@Param('orderNumber') orderNumber: string) {
    return this.ordersService.trackByNumber(orderNumber);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const order = await this.ordersService.findOne(id);
    const isStaff = user.role !== RoleName.CLIENT;
    if (!isStaff && order.clientId !== user.clientId) {
      throw new ForbiddenException('Cette commande ne vous appartient pas.');
    }
    return order;
  }

  @Roles(
    RoleName.ADMIN,
    RoleName.GERANT,
    RoleName.RECEPTIONNISTE,
    RoleName.AGENT_LAVERIE,
    RoleName.AGENT_NETTOYAGE,
    RoleName.CHAUFFEUR,
  )
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.updateStatus(id, dto.status, user.userId, dto.comment);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.assign(id, dto, user.userId);
  }
}
