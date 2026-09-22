import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { CreatePromotionDto, UpdatePromotionDto } from './promotions.dto';
import { PromotionsService } from './promotions.service';

@ApiTags('Administration — Promotions')
@ApiBearerAuth()
@Controller('admin/promotions')
export class PromotionsController {
  constructor(private promotions: PromotionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROMOTIONS_MANAGE.code)
  list() {
    return this.promotions.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROMOTIONS_MANAGE.code)
  create(@Body() dto: CreatePromotionDto, @CurrentUser() user: AuthUser) {
    return this.promotions.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PROMOTIONS_MANAGE.code)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromotionDto, @CurrentUser() user: AuthUser) {
    return this.promotions.update(id, dto, user.id);
  }
}
