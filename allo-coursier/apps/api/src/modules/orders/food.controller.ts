import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireRoles } from '../../common/decorators/roles.decorator';
import { ROLE } from '../../common/permissions';
import {
  CancelOrderDto,
  CreateFoodOrderDto,
  FoodQuoteDto,
  MerchantAcceptDto,
  MerchantOrdersQueryDto,
  MerchantPayoutDto,
} from './dto/orders.dto';
import { FoodService } from './food.service';

@ApiTags('Repas — client')
@Controller('orders/food')
export class FoodController {
  constructor(private food: FoodService) {}

  /** Prix du panier et de la livraison, sans compte (pour afficher le total avant connexion). */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('quote')
  quote(@Body() dto: FoodQuoteDto) {
    return this.food.quote(dto);
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @RequireRoles(ROLE.CLIENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFoodOrderDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.food.create(user.id, dto, idempotencyKey?.slice(0, 100) || undefined);
  }
}

@ApiTags('Espace commerçant — commandes')
@ApiBearerAuth()
@RequireRoles(ROLE.MERCHANT)
@Controller('merchant/:merchantId')
export class MerchantOrdersController {
  constructor(private food: FoodService) {}

  @Get('orders')
  list(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Query() query: MerchantOrdersQueryDto) {
    return this.food.listForMerchant(user.id, merchantId, query);
  }

  @Get('orders/:id')
  get(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.food.orderDetail(user.id, merchantId, id);
  }

  @HttpCode(200)
  @Post('orders/:id/accept')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MerchantAcceptDto,
  ) {
    return this.food.accept(user.id, merchantId, id, dto.prepMinutes);
  }

  @HttpCode(200)
  @Post('orders/:id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.food.reject(user.id, merchantId, id, dto.reason);
  }

  @HttpCode(200)
  @Post('orders/:id/ready')
  ready(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.food.ready(user.id, merchantId, id);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.food.stats(user.id, merchantId);
  }

  @Get('wallet')
  wallet(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.food.wallet(user.id, merchantId);
  }

  @Post('payouts')
  payout(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() dto: MerchantPayoutDto) {
    return this.food.requestPayout(user.id, merchantId, dto);
  }
}
