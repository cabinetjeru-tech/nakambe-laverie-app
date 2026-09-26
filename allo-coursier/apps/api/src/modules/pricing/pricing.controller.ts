import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '../../common/permissions';
import {
  CreatePricingRuleDto,
  PricingRuleQueryDto,
  QuoteRequestDto,
  SimulateQuoteDto,
  UpdatePricingRuleDto,
} from './dto/pricing.dto';
import { PricingService } from './pricing.service';

@ApiTags('Tarifs')
@Controller()
export class PricingController {
  constructor(private pricing: PricingService) {}

  /** Devis instantané (accessible sans compte, pour afficher le prix avant l'inscription). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('pricing/quote')
  quote(@Body() dto: QuoteRequestDto) {
    return this.pricing.quote(dto);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('admin/pricing/simulate')
  @RequirePermissions(PERMISSIONS.PRICING_READ.code)
  simulate(@Body() dto: SimulateQuoteDto) {
    return this.pricing.simulate(dto);
  }

  @ApiBearerAuth()
  @Get('admin/pricing-rules')
  @RequirePermissions(PERMISSIONS.PRICING_READ.code)
  list(@Query() query: PricingRuleQueryDto, @CurrentUser() user: AuthUser) {
    return this.pricing.listRules(query, user);
  }

  @ApiBearerAuth()
  @Get('admin/pricing-rules/:id')
  @RequirePermissions(PERMISSIONS.PRICING_READ.code)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricing.getRule(id);
  }

  @ApiBearerAuth()
  @Post('admin/pricing-rules')
  @RequirePermissions(PERMISSIONS.PRICING_MANAGE.code)
  create(@Body() dto: CreatePricingRuleDto, @CurrentUser() user: AuthUser) {
    return this.pricing.createRule(dto, user);
  }

  @ApiBearerAuth()
  @Patch('admin/pricing-rules/:id')
  @RequirePermissions(PERMISSIONS.PRICING_MANAGE.code)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePricingRuleDto, @CurrentUser() user: AuthUser) {
    return this.pricing.updateRule(id, dto, user);
  }

  @ApiBearerAuth()
  @Delete('admin/pricing-rules/:id')
  @RequirePermissions(PERMISSIONS.PRICING_MANAGE.code)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.pricing.deactivateRule(id, user);
  }
}
