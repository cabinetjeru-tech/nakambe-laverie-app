import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser } from '../../core/auth/auth-user';
import { Authenticated, CurrentUser, ManualTransaction, Public, ReadOnlyExempt, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { BillingService } from './billing.service';
import { ChangePlanDto, PayInvoiceDto, SandboxCompleteDto } from './dto/billing.dto';

/**
 * Abonnement du salon à la plateforme. Toutes ces routes restent ouvertes quand le salon
 * est suspendu (@ReadOnlyExempt) : c'est précisément là qu'il vient régler sa facture.
 */
@ReadOnlyExempt()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Bandeau de l'application : tout membre connecté à une entreprise. */
  @Authenticated()
  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.billing.status(user);
  }

  @RequirePermissions('billing.manage')
  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.billing.overview(user);
  }

  @RequirePermissions('billing.manage')
  @Get('invoices')
  invoices() {
    return this.billing.invoices();
  }

  @RequirePermissions('billing.manage')
  @Get('invoices/:id')
  invoice(@Param('id', ParseIdPipe) id: string) {
    return this.billing.invoice(id);
  }

  @RequirePermissions('billing.manage')
  @Post('plan')
  changePlan(@CurrentUser() user: AuthUser, @Body() dto: ChangePlanDto) {
    return this.billing.changePlan(user, dto);
  }

  @RequirePermissions('billing.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('cancel')
  cancel() {
    return this.billing.cancel();
  }

  @RequirePermissions('billing.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resume')
  resume() {
    return this.billing.resume();
  }

  @RequirePermissions('billing.manage')
  @ManualTransaction()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invoices/:id/pay')
  pay(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: PayInvoiceDto) {
    return this.billing.pay(user, id, dto);
  }

  @RequirePermissions('billing.manage')
  @ManualTransaction()
  @Get('payments/:id')
  payment(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.billing.paymentStatus(user, id);
  }

  /**
   * Notification de l'agrégateur (serveur à serveur). Le contenu n'est jamais cru : seul
   * l'identifiant de transaction est lu, puis l'agrégateur est interrogé.
   */
  @Public()
  @ManualTransaction()
  @HttpCode(HttpStatus.OK)
  @Post('webhooks/:provider')
  async webhook(@Req() request: Request) {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = String(body.cpm_trans_id ?? body.transaction_id ?? '').trim();
    if (!token || token.length > 100) return { received: true };
    return { received: true, status: await this.billing.confirmOnline(token) };
  }

  /** CinetPay vérifie la disponibilité de l'URL de notification par un GET. */
  @Public()
  @ManualTransaction()
  @Get('webhooks/:provider')
  webhookPing() {
    return { ok: true };
  }

  /** Simulateur d'agrégateur (hors production uniquement). */
  @RequirePermissions('billing.manage')
  @ManualTransaction()
  @Post('sandbox/:transaction/complete')
  sandbox(@CurrentUser() user: AuthUser, @Param('transaction') transaction: string, @Body() dto: SandboxCompleteDto) {
    return this.billing.sandboxComplete(user, transaction, dto.outcome, dto.amount);
  }
}
