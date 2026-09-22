import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { DriversService } from './drivers.service';
import { CreateDriverDto, DriverQueryDto, RejectDriverDto, ReviewDocumentDto, UpdateDriverDto } from './dto/drivers.dto';

@ApiTags('Administration — Livreurs')
@ApiBearerAuth()
@Controller('admin/drivers')
export class DriversController {
  constructor(private drivers: DriversService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DRIVERS_READ.code)
  list(@Query() query: DriverQueryDto) {
    return this.drivers.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DRIVERS_READ.code)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DRIVERS_MANAGE.code, PERMISSIONS.DRIVERS_VALIDATE.code)
  create(@Body() dto: CreateDriverDto, @CurrentUser() user: AuthUser) {
    return this.drivers.create(dto, user.id);
  }

  @HttpCode(200)
  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.DRIVERS_VALIDATE.code)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.drivers.approve(id, user.id);
  }

  @HttpCode(200)
  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.DRIVERS_VALIDATE.code)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDriverDto, @CurrentUser() user: AuthUser) {
    return this.drivers.reject(id, dto.reason, user.id);
  }

  @HttpCode(200)
  @Post(':id/documents/:documentId/review')
  @RequirePermissions(PERMISSIONS.DRIVERS_VALIDATE.code)
  reviewDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ReviewDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.drivers.reviewDocument(id, documentId, dto.approve, dto.reason, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DRIVERS_MANAGE.code)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto, @CurrentUser() user: AuthUser) {
    return this.drivers.update(id, dto, user.id);
  }
}
