import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === RoleName.CLIENT && user.clientId) {
      return this.notificationsService.findForClient(user.clientId);
    }
    return this.notificationsService.findForUser(user.userId);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }
}
