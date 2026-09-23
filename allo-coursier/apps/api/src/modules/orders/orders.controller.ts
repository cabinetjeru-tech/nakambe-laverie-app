import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireRoles } from '../../common/decorators/roles.decorator';
import { ROLE } from '../../common/permissions';
import { ChatService } from './chat.service';
import {
  CancelOrderDto,
  CreateOrderDto,
  ManualMobileMoneyDto,
  MessagesQueryDto,
  OrderQueryDto,
  RatingDto,
  SendMessageDto,
} from './dto/orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('Commandes — client')
@Controller()
export class OrdersController {
  constructor(
    private orders: OrdersService,
    private chat: ChatService,
  ) {}

  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Évite les doublons si la requête est renvoyée après une coupure réseau' })
  @RequireRoles(ROLE.CLIENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.orders.create(user.id, dto, idempotencyKey?.slice(0, 100) || undefined);
  }

  @ApiBearerAuth()
  @RequireRoles(ROLE.CLIENT)
  @Get('orders')
  list(@CurrentUser() user: AuthUser, @Query() query: OrderQueryDto) {
    return this.orders.listForClient(user.id, query);
  }

  @ApiBearerAuth()
  @RequireRoles(ROLE.CLIENT)
  @Get('orders/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getForClient(user.id, id);
  }

  @ApiBearerAuth()
  @RequireRoles(ROLE.CLIENT)
  @HttpCode(200)
  @Post('orders/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancelByClient(user.id, id, dto);
  }

  /** Déclaration du paiement Mobile Money (transfert au numéro de l'entreprise). */
  @ApiBearerAuth()
  @RequireRoles(ROLE.CLIENT)
  @HttpCode(200)
  @Post('orders/:id/payment')
  submitPayment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManualMobileMoneyDto) {
    return this.orders.submitPayment(user.id, id, dto);
  }

  /** Notation : le client note le livreur, le livreur note le client. */
  @ApiBearerAuth()
  @Post('orders/:id/rating')
  rate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RatingDto) {
    return this.orders.rate(user, id, dto);
  }

  // ------------------------------------------------------------------ chat (client, livreur, équipe)

  @ApiBearerAuth()
  @Get('orders/:id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() query: MessagesQueryDto) {
    return this.chat.list(user, id, query.after);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('orders/:id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.chat.send(user, id, dto);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('orders/:id/messages/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.markRead(user, id);
  }

  @Public()
  @Get('chat/quick-replies')
  quickReplies() {
    return this.chat.quickReplies();
  }

  // ------------------------------------------------------------------ suivi public

  /** Suivi par lien, partageable au destinataire (sans compte). */
  @Public()
  @Get('track/:token')
  track(@Param('token') token: string) {
    return this.orders.track(token);
  }
}
