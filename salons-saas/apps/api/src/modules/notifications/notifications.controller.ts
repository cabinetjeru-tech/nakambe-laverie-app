import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { Authenticated, CurrentUser, ReadOnlyExempt } from '../../core/auth/decorators';
import { DbService } from '../../core/db/db.service';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { NotificationQueryDto } from '../billing/dto/billing.dto';

/**
 * Notifications de l'application pour le membre connecté (cloche) : abonnement, factures,
 * réponses du support… Connexion de l'API (RLS) + filtre sur le destinataire.
 */
@ReadOnlyExempt()
@Authenticated()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly db: DbService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto) {
    return this.db.tx.notification.findMany({
      where: { ...mine(user), ...(query.unread === 'true' ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 30,
      select: { id: true, event: true, title: true, body: true, actionUrl: true, readAt: true, createdAt: true },
    });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { count: await this.db.tx.notification.count({ where: { ...mine(user), readAt: null } }) };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    await this.db.tx.notification.updateMany({ where: { id, ...mine(user), readAt: null }, data: { readAt: new Date() } });
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('read-all')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.db.tx.notification.updateMany({ where: { ...mine(user), readAt: null }, data: { readAt: new Date() } });
  }
}

function mine(user: AuthUser) {
  if (!user.tenantId) throw new ForbiddenException('Sélectionnez une entreprise.');
  return { recipientUserId: user.userId, channel: 'IN_APP' as const };
}
