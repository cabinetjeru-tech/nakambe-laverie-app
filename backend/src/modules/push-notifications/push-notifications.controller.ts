import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PushNotificationsService } from './push-notifications.service';
import { SavePushSubscriptionDto, RemovePushSubscriptionDto } from './dto/push-subscription.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('push-notifications')
@Controller('push')
export class PushNotificationsController {
  constructor(private pushService: PushNotificationsService) {}

  @Get('vapid-public-key')
  getPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Get('status')
  async status(@CurrentUser() user: AuthenticatedUser) {
    return { subscribed: await this.pushService.hasActiveSubscription(user.userId) };
  }

  @Post('subscribe')
  subscribe(@Body() dto: SavePushSubscriptionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pushService.subscribe(user.userId, dto);
  }

  @Delete('subscribe')
  unsubscribe(@Body() dto: RemovePushSubscriptionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pushService.unsubscribe(user.userId, dto.endpoint);
  }
}
