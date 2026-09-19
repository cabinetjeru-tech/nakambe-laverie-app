import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { EngagementService } from './engagement.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('engagement')
@Controller()
export class EngagementController {
  constructor(private engagementService: EngagementService) {}

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Post('loyalty/rules')
  createLoyaltyRule(@Body() dto: any) {
    return this.engagementService.createLoyaltyRule(dto);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Get('loyalty/rules')
  findLoyaltyRules() {
    return this.engagementService.findLoyaltyRules();
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Patch('loyalty/rules/:id')
  updateLoyaltyRule(@Param('id') id: string, @Body() dto: any) {
    return this.engagementService.updateLoyaltyRule(id, dto);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Post('promotions')
  createPromotion(@Body() dto: any) {
    return this.engagementService.createPromotion(dto);
  }

  @Public()
  @Get('promotions')
  findPromotions(@Query('activeOnly') activeOnly?: string) {
    return this.engagementService.findPromotions(activeOnly === 'true');
  }

  @Public()
  @Get('promotions/validate/:code')
  validatePromoCode(@Param('code') code: string) {
    return this.engagementService.validatePromoCode(code);
  }

  @Roles(RoleName.CLIENT)
  @Post('reviews')
  createReview(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.engagementService.createReview({ ...dto, clientId: user.clientId! });
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Get('reviews')
  findReviews() {
    return this.engagementService.findReviews();
  }

  @Roles(RoleName.CLIENT)
  @Get('reviews/mine')
  findMyReviews(@CurrentUser() user: AuthenticatedUser) {
    return this.engagementService.findReviews(user.clientId ?? undefined);
  }

  @Roles(RoleName.CLIENT, RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Post('complaints')
  createComplaint(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const clientId = user.role === RoleName.CLIENT ? user.clientId! : dto.clientId;
    return this.engagementService.createComplaint({ ...dto, clientId });
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Get('complaints')
  findComplaints(@Query('status') status?: string) {
    return this.engagementService.findComplaints(status);
  }

  @Roles(RoleName.CLIENT)
  @Get('complaints/mine')
  findMyComplaints(@CurrentUser() user: AuthenticatedUser) {
    return this.engagementService.findComplaints(undefined, user.clientId ?? undefined);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Patch('complaints/:id')
  updateComplaint(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.engagementService.updateComplaint(id, { ...dto, handledById: user.userId });
  }
}
