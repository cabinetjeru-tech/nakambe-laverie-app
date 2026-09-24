import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Authenticated, ManualTransaction, ReadOnlyExempt } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { ExtendTrialDto, ReasonDto } from '../billing/dto/billing.dto';
import { PlatformTicketMessageDto, TicketQueryDto, UpdateTicketDto } from '../support/support.dto';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformSettingsAdminService } from './platform-settings.admin.service';
import { CurrentPlatformActor, PlatformStaffGuard } from './platform-staff.guard';
import { PlatformRoles, PlatformActor } from './platform-roles';
import { PlatformStatsService } from './platform-stats.service';
import { PlatformSupportService } from './platform-support.service';
import { PlatformTenantsService } from './platform-tenants.service';
import { PlatformUsersService } from './platform-users.service';
import {
  GrantStaffDto,
  InvoiceQueryDto,
  PaymentQueryDto,
  PlanDto,
  PlatformSettingsDto,
  SubscriptionQueryDto,
  TenantQueryDto,
  UserQueryDto,
  UserStatusDto,
} from './platform.dto';

/**
 * Console SUPER ADMINISTRATEUR (équipe de l'éditeur).
 *   Accueil · Salons · Utilisateurs · Abonnements · Paiements · Revenus · Statistiques ·
 *   Support · Paramètres
 * Connexion salons_platform uniquement (ManualTransaction : aucune transaction de salon).
 */
@Authenticated()
@ManualTransaction()
@ReadOnlyExempt()
@UseGuards(PlatformStaffGuard)
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly tenants: PlatformTenantsService,
    private readonly users: PlatformUsersService,
    private readonly billing: PlatformBillingService,
    private readonly stats: PlatformStatsService,
    private readonly support: PlatformSupportService,
    private readonly settings: PlatformSettingsAdminService,
  ) {}

  @Get('me')
  me(@CurrentPlatformActor() actor: PlatformActor) {
    return actor;
  }

  @Get('home')
  home() {
    return this.stats.home();
  }

  // ================================================================== Salons

  @Get('tenants')
  tenantList(@Query() query: TenantQueryDto) {
    return this.tenants.list(query);
  }

  @Get('tenants/:id')
  tenantDetail(@Param('id', ParseIdPipe) id: string) {
    return this.tenants.detail(id);
  }

  @PlatformRoles('PLATFORM_BILLING', 'PLATFORM_SUPPORT')
  @Post('tenants/:id/extend-trial')
  extendTrial(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string, @Body() dto: ExtendTrialDto) {
    return this.tenants.extendTrial(actor.userId, id, dto.days);
  }

  @PlatformRoles('PLATFORM_BILLING')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('tenants/:id/suspend')
  suspend(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string, @Body() dto: ReasonDto) {
    return this.tenants.suspend(actor.userId, id, dto.reason);
  }

  @PlatformRoles('PLATFORM_BILLING')
  @Post('tenants/:id/reactivate')
  reactivate(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string) {
    return this.tenants.reactivate(actor.userId, id);
  }

  // ================================================================== Utilisateurs

  @PlatformRoles('PLATFORM_SUPPORT')
  @Get('users')
  userList(@Query() query: UserQueryDto) {
    return this.users.list({ search: query.search, status: query.status, staffOnly: query.staff === 'true' });
  }

  @PlatformRoles('PLATFORM_SUPPORT')
  @Get('users/:id')
  userDetail(@Param('id', ParseIdPipe) id: string) {
    return this.users.detail(id);
  }

  @PlatformRoles('PLATFORM_SUPPORT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('users/:id/status')
  userStatus(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string, @Body() dto: UserStatusDto) {
    return this.users.setStatus(actor.userId, id, dto.status, dto.reason);
  }

  @PlatformRoles('PLATFORM_SUPPORT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('users/:id/unlock')
  unlock(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string) {
    return this.users.unlock(actor.userId, id);
  }

  @PlatformRoles('PLATFORM_SUPPORT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('users/:id/logout')
  logoutEverywhere(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string) {
    return this.users.logoutEverywhere(actor.userId, id);
  }

  // ================================================================== Abonnements

  @PlatformRoles('PLATFORM_BILLING')
  @Get('subscriptions')
  subscriptions(@Query() query: SubscriptionQueryDto) {
    return this.billing.subscriptions(query);
  }

  // ================================================================== Paiements

  @PlatformRoles('PLATFORM_BILLING')
  @Get('payments')
  payments(@Query() query: PaymentQueryDto) {
    return this.billing.payments(query);
  }

  @PlatformRoles('PLATFORM_BILLING')
  @Get('invoices')
  invoices(@Query() query: InvoiceQueryDto) {
    return this.billing.invoices(query);
  }

  @PlatformRoles('PLATFORM_BILLING')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('payments/:id/validate')
  validatePayment(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string) {
    return this.billing.validatePayment(actor.userId, id);
  }

  @PlatformRoles('PLATFORM_BILLING')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('payments/:id/reject')
  rejectPayment(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string, @Body() dto: ReasonDto) {
    return this.billing.rejectPayment(actor.userId, id, dto.reason);
  }

  @PlatformRoles('PLATFORM_BILLING')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('invoices/:id/void')
  voidInvoice(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string, @Body() dto: ReasonDto) {
    return this.billing.voidInvoice(actor.userId, id, dto.reason);
  }

  @PlatformRoles('PLATFORM_BILLING')
  @Post('billing/run')
  runBilling(@CurrentPlatformActor() actor: PlatformActor) {
    return this.billing.runBilling(actor.userId);
  }

  // ================================================================== Revenus, statistiques

  @PlatformRoles('PLATFORM_BILLING')
  @Get('revenue')
  revenue() {
    return this.stats.revenue();
  }

  @Get('statistics')
  statistics() {
    return this.stats.statistics();
  }

  // ================================================================== Support

  @PlatformRoles('PLATFORM_SUPPORT')
  @Get('support/tickets')
  tickets(@CurrentPlatformActor() actor: PlatformActor, @Query() query: TicketQueryDto) {
    return this.support.list(actor.userId, query);
  }

  @PlatformRoles('PLATFORM_SUPPORT')
  @Get('support/tickets/:id')
  ticket(@Param('id', ParseIdPipe) id: string) {
    return this.support.detail(id);
  }

  @PlatformRoles('PLATFORM_SUPPORT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('support/tickets/:id/messages')
  replyTicket(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string, @Body() dto: PlatformTicketMessageDto) {
    return this.support.reply(actor.userId, id, dto.body, dto.internal ?? false);
  }

  @PlatformRoles('PLATFORM_SUPPORT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('support/tickets/:id')
  updateTicket(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string, @Body() dto: UpdateTicketDto) {
    return this.support.update(actor.userId, id, dto);
  }

  // ================================================================== Paramètres

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @PlatformRoles('PLATFORM_OWNER')
  @Patch('settings')
  updateSettings(@CurrentPlatformActor() actor: PlatformActor, @Body() dto: PlatformSettingsDto) {
    return this.settings.update(actor.userId, dto);
  }

  @Get('plans')
  plans() {
    return this.settings.plans();
  }

  @PlatformRoles('PLATFORM_OWNER')
  @Post('plans')
  createPlan(@CurrentPlatformActor() actor: PlatformActor, @Body() dto: PlanDto) {
    return this.settings.createPlan(actor.userId, dto);
  }

  @PlatformRoles('PLATFORM_OWNER')
  @Put('plans/:id')
  updatePlan(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseIdPipe) id: string, @Body() dto: PlanDto) {
    return this.settings.updatePlan(actor.userId, id, dto);
  }

  @Get('staff')
  staff() {
    return this.users.staff();
  }

  @PlatformRoles('PLATFORM_OWNER')
  @Post('staff')
  grantStaff(@CurrentPlatformActor() actor: PlatformActor, @Body() dto: GrantStaffDto) {
    return this.users.grantStaff(actor.userId, dto.phone, dto.role);
  }

  @PlatformRoles('PLATFORM_OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('staff/:userId/revoke')
  revokeStaff(@CurrentPlatformActor() actor: PlatformActor, @Param('userId', ParseIdPipe) userId: string) {
    return this.users.revokeStaff(actor.userId, userId);
  }
}
