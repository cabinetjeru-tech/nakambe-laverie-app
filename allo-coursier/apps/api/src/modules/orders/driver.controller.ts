import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentType } from '@prisma/client';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRoles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ROLE } from '../../common/permissions';
import { CourierService } from './courier.service';
import { DispatchService } from './dispatch.service';
import { DeliverDto, DriverActionDto, LocationBatchDto, OnlineDto, PurchaseDto, RejectOfferDto } from './dto/orders.dto';

class AddDocumentDto {
  @ApiProperty({ enum: DocumentType }) @IsEnum(DocumentType) type: DocumentType;
  @ApiProperty({ description: 'Clé renvoyée par /uploads/DRIVER_DOCUMENT' }) @IsString() @MaxLength(80) fileKey: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() expiresAt?: Date;
}

@ApiTags('Application livreur')
@ApiBearerAuth()
@RequireRoles(ROLE.DRIVER)
@Controller('driver')
export class DriverController {
  constructor(
    private courier: CourierService,
    private dispatch: DispatchService,
  ) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.courier.profile(user.id);
  }

  @HttpCode(200)
  @Post('online')
  online(@CurrentUser() user: AuthUser, @Body() dto: OnlineDto) {
    return this.courier.setOnline(user.id, dto);
  }

  /** Positions GPS (une ou plusieurs, envoyées en lot après une coupure réseau). */
  @HttpCode(200)
  @Post('location')
  location(@CurrentUser() user: AuthUser, @Body() dto: LocationBatchDto) {
    return this.courier.recordLocations(user.id, dto.points);
  }

  @Get('offers')
  offers(@CurrentUser() user: AuthUser) {
    return this.dispatch.listOffers(user.id);
  }

  @HttpCode(200)
  @Post('offers/:id/accept')
  async accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const order = await this.dispatch.accept(user.id, id);
    return this.courier.missionDetail(user.id, order.id);
  }

  @HttpCode(200)
  @Post('offers/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectOfferDto) {
    return this.dispatch.reject(user.id, id, dto.reason);
  }

  @Get('mission')
  active(@CurrentUser() user: AuthUser) {
    return this.courier.activeMission(user.id);
  }

  @Get('missions')
  history(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.courier.history(user.id, query.page, query.pageSize);
  }

  @Get('missions/:id')
  mission(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courier.missionDetail(user.id, id);
  }

  @HttpCode(200)
  @Post('missions/:id/action')
  act(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DriverActionDto) {
    return this.courier.act(user.id, id, dto);
  }

  @HttpCode(200)
  @Post('missions/:id/purchase')
  purchase(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PurchaseDto) {
    return this.courier.recordPurchase(user.id, id, dto);
  }

  @HttpCode(200)
  @Post('missions/:id/deliver')
  deliver(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliverDto) {
    return this.courier.deliver(user.id, id, dto);
  }

  @Get('earnings')
  earnings(@CurrentUser() user: AuthUser) {
    return this.courier.earnings(user.id);
  }

  @Post('documents')
  addDocument(@CurrentUser() user: AuthUser, @Body() dto: AddDocumentDto) {
    return this.courier.addDocument(user.id, dto.type, dto.fileKey, dto.expiresAt);
  }
}
