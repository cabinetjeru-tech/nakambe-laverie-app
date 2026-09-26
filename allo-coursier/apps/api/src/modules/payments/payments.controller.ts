import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireRoles } from '../../common/decorators/roles.decorator';
import { PERMISSIONS, ROLE } from '../../common/permissions';
import { PaymentQueryDto, RejectPaymentDto, TopupDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Paiements')
@Controller()
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Public()
  @Get('payments/methods')
  methods() {
    return this.payments.methods();
  }

  @ApiBearerAuth()
  @RequireRoles(ROLE.CLIENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('wallet/topups')
  topup(@CurrentUser() user: AuthUser, @Body() dto: TopupDto) {
    return this.payments.requestTopup(user.id, dto);
  }

  @ApiBearerAuth()
  @Get('payments/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.payments.myPayments(user.id);
  }

  @ApiBearerAuth()
  @Get('admin/payments')
  @RequirePermissions(PERMISSIONS.PAYMENTS_READ.code)
  list(@Query() query: PaymentQueryDto) {
    return this.payments.list(query);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('admin/payments/:id/validate')
  @RequirePermissions(PERMISSIONS.PAYMENTS_VALIDATE.code)
  validate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payments.validate(id, user.id);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('admin/payments/:id/reject')
  @RequirePermissions(PERMISSIONS.PAYMENTS_VALIDATE.code)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.reject(id, dto.reason, user.id);
  }
}
