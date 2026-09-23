import { Body, Controller, Delete, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, IsUrl, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';
import type { Request } from 'express';
import { UserStatus } from '@prisma/client';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS, ROLE } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from './notifications.service';

class PushKeysDto {
  @ApiProperty() @IsString() @MaxLength(200) p256dh: string;
  @ApiProperty() @IsString() @MaxLength(100) auth: string;
}

class PushSubscribeDto {
  @ApiProperty() @IsUrl({ require_tld: false }) @MaxLength(1000) endpoint: string;
  @ApiProperty({ type: PushKeysDto }) @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
}

class PushUnsubscribeDto {
  @ApiProperty() @IsString() @MaxLength(1000) endpoint: string;
}

class MarkReadDto {
  @ApiPropertyOptional({ type: [String], description: 'Vide = toutes' })
  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  ids?: string[];
}

class BroadcastDto {
  @ApiProperty({ enum: ['CLIENTS', 'DRIVERS', 'ALL'] }) @IsIn(['CLIENTS', 'DRIVERS', 'ALL'])
  audience: 'CLIENTS' | 'DRIVERS' | 'ALL';

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  cityId?: string;

  @ApiProperty() @IsString() @Length(2, 80)
  title: string;

  @ApiProperty() @IsString() @Length(2, 300)
  body: string;
}

@ApiTags('Notifications')
@Controller()
export class NotificationsController {
  constructor(
    private notifications: NotificationsService,
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Public()
  @Get('push/public-key')
  publicKey() {
    return { publicKey: this.notifications.pushPublicKey };
  }

  @ApiBearerAuth()
  @Post('push/subscribe')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: PushSubscribeDto, @Req() req: Request) {
    return this.notifications.subscribe(user.id, { endpoint: dto.endpoint, ...dto.keys }, req.headers['user-agent']?.slice(0, 250));
  }

  @ApiBearerAuth()
  @Delete('push/subscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushUnsubscribeDto) {
    return this.notifications.unsubscribe(user.id, dto.endpoint);
  }

  @ApiBearerAuth()
  @Get('notifications')
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('notifications/read')
  markRead(@CurrentUser() user: AuthUser, @Body() dto: MarkReadDto) {
    return this.notifications.markRead(user.id, dto.ids);
  }

  /** Message ciblé (promotion, information) envoyé aux clients et/ou livreurs. */
  @ApiBearerAuth()
  @Post('admin/notifications/broadcast')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_SEND.code)
  async broadcast(@Body() dto: BroadcastDto, @CurrentUser() actor: AuthUser) {
    const roleCodes = dto.audience === 'CLIENTS' ? [ROLE.CLIENT] : dto.audience === 'DRIVERS' ? [ROLE.DRIVER] : [ROLE.CLIENT, ROLE.DRIVER];
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: { code: { in: roleCodes } } } },
        ...(dto.cityId
          ? {
              OR: [
                { driverProfile: { cityId: dto.cityId } },
                { addresses: { some: { cityId: dto.cityId } } },
                { clientOrders: { some: { cityId: dto.cityId } } },
              ],
            }
          : {}),
      },
      select: { id: true },
    });
    await this.notifications.notify(users.map((u) => u.id), { type: 'BROADCAST', title: dto.title, body: dto.body });
    await this.audit.log({ actorId: actor.id, action: 'notification.broadcast', entityType: 'Notification', after: { ...dto, recipients: users.length } });
    return { recipients: users.length };
  }
}
