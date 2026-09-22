import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireRoles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PERMISSIONS, ROLE } from '../../common/permissions';
import {
  AdjustWalletDto,
  CashSettlementDto,
  PayoutQueryDto,
  PayoutRequestDto,
  PayPayoutDto,
  RejectDto,
  SettlementQueryDto,
  WalletQueryDto,
} from './wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('Portefeuilles')
@ApiBearerAuth()
@Controller()
export class WalletController {
  constructor(private wallets: WalletService) {}

  @RequireRoles(ROLE.CLIENT)
  @Get('wallet')
  clientWallet(@CurrentUser() user: AuthUser) {
    return this.wallets.myWallet(user.id, 'CLIENT');
  }

  @RequireRoles(ROLE.DRIVER)
  @Get('driver/wallet')
  driverWallet(@CurrentUser() user: AuthUser) {
    return this.wallets.myWallet(user.id, 'DRIVER');
  }

  @RequireRoles(ROLE.DRIVER)
  @Post('driver/payouts')
  requestPayout(@CurrentUser() user: AuthUser, @Body() dto: PayoutRequestDto) {
    return this.wallets.requestPayout(user.id, dto);
  }

  @RequireRoles(ROLE.DRIVER)
  @Get('driver/payouts')
  myPayouts(@CurrentUser() user: AuthUser) {
    return this.wallets.myPayouts(user.id);
  }

  // ------------------------------------------------------------------ administration

  @Get('admin/finance/summary')
  @RequirePermissions(PERMISSIONS.PAYMENTS_READ.code)
  summary() {
    return this.wallets.summary();
  }

  @Get('admin/wallets')
  @RequirePermissions(PERMISSIONS.WALLETS_MANAGE.code)
  list(@Query() query: WalletQueryDto) {
    return this.wallets.listWallets(query);
  }

  @Get('admin/wallets/:id/entries')
  @RequirePermissions(PERMISSIONS.WALLETS_MANAGE.code)
  entries(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.wallets.walletEntries(id, query.page, query.pageSize);
  }

  @HttpCode(200)
  @Post('admin/wallets/:id/adjust')
  @RequirePermissions(PERMISSIONS.WALLETS_MANAGE.code, PERMISSIONS.PAYMENTS_VALIDATE.code)
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustWalletDto, @CurrentUser() user: AuthUser) {
    return this.wallets.adjust(id, dto, user.id);
  }

  @Post('admin/drivers/:id/cash-settlements')
  @RequirePermissions(PERMISSIONS.WALLETS_MANAGE.code)
  settle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CashSettlementDto, @CurrentUser() user: AuthUser) {
    return this.wallets.recordCashSettlement(id, dto, user.id);
  }

  @Get('admin/cash-settlements')
  @RequirePermissions(PERMISSIONS.WALLETS_MANAGE.code)
  settlements(@Query() query: SettlementQueryDto) {
    return this.wallets.listSettlements(query);
  }

  @Get('admin/payouts')
  @RequirePermissions(PERMISSIONS.WALLETS_MANAGE.code)
  payouts(@Query() query: PayoutQueryDto) {
    return this.wallets.listPayouts(query);
  }

  @HttpCode(200)
  @Post('admin/payouts/:id/pay')
  @RequirePermissions(PERMISSIONS.WALLETS_MANAGE.code)
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayoutDto, @CurrentUser() user: AuthUser) {
    return this.wallets.payPayout(id, dto.reference, user.id);
  }

  @HttpCode(200)
  @Post('admin/payouts/:id/reject')
  @RequirePermissions(PERMISSIONS.WALLETS_MANAGE.code)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto, @CurrentUser() user: AuthUser) {
    return this.wallets.rejectPayout(id, dto.reason, user.id);
  }
}
