import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { OnlinePaymentsService } from './online-payments.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('online-payments')
@Controller('online-payments')
export class OnlinePaymentsController {
  constructor(private onlinePaymentsService: OnlinePaymentsService) {}

  @Roles(RoleName.CLIENT, RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Post('quotes/:id/pay')
  payQuote(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const requestingClientId = user.role === RoleName.CLIENT ? user.clientId ?? undefined : undefined;
    return this.onlinePaymentsService.initiateForQuote(id, requestingClientId);
  }

  @Roles(RoleName.CLIENT, RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Post('invoices/:id/pay')
  payInvoice(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const requestingClientId = user.role === RoleName.CLIENT ? user.clientId ?? undefined : undefined;
    return this.onlinePaymentsService.initiateForInvoice(id, requestingClientId);
  }

  @Roles(RoleName.CLIENT, RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Get('quotes/:id/status')
  quoteStatus(@Param('id') id: string) {
    return this.onlinePaymentsService.latestStatusForQuote(id);
  }

  @Roles(RoleName.CLIENT, RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Get('invoices/:id/status')
  invoiceStatus(@Param('id') id: string) {
    return this.onlinePaymentsService.latestStatusForInvoice(id);
  }

  /**
   * Notification instantanée de paiement (IPN) envoyée par LigdiCash ou CinetPay.
   * Jamais fiée telle quelle : on ne fait que déclencher une re-vérification
   * serveur-à-serveur auprès du fournisseur concerné (syncTransaction).
   */
  @Public()
  @Post('callback')
  async callback(@Body() body: Record<string, any>, @Query() query: Record<string, any>) {
    const token = body?.token ?? body?.invoiceToken ?? body?.data?.token ?? body?.cpm_trans_id ?? query?.cpm_trans_id ?? query?.token;
    if (!token) return { received: true };
    await this.onlinePaymentsService.syncTransaction(token);
    return { received: true };
  }

  /** CinetPay peut aussi appeler notify_url en GET selon la configuration du compte marchand. */
  @Public()
  @Get('callback')
  async callbackGet(@Query() query: Record<string, any>) {
    const token = query?.cpm_trans_id ?? query?.token;
    if (!token) return { received: true };
    await this.onlinePaymentsService.syncTransaction(token);
    return { received: true };
  }
}
