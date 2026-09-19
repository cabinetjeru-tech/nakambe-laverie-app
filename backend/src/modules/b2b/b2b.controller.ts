import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { B2bService } from './b2b.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('b2b')
@Roles(RoleName.ADMIN, RoleName.GERANT)
@Controller('b2b')
export class B2bController {
  constructor(private b2bService: B2bService) {}

  @Post('contracts')
  createContract(@Body() dto: any) {
    return this.b2bService.createContract(dto);
  }

  @Get('contracts')
  findContracts(@Query('clientId') clientId?: string) {
    return this.b2bService.findContracts(clientId);
  }

  @Roles(RoleName.CLIENT)
  @Get('contracts/mine')
  findMyContracts(@CurrentUser() user: AuthenticatedUser) {
    return this.b2bService.findContracts(user.clientId ?? undefined);
  }

  @Get('contracts/expiring')
  findExpiring() {
    return this.b2bService.findExpiringContracts();
  }

  @Patch('contracts/:id')
  updateContract(@Param('id') id: string, @Body() dto: any) {
    return this.b2bService.updateContract(id, dto);
  }

  @Post('subscriptions')
  createSubscription(@Body() dto: any) {
    return this.b2bService.createSubscription(dto);
  }

  @Get('subscriptions')
  findSubscriptions(@Query('clientId') clientId?: string) {
    return this.b2bService.findSubscriptions(clientId);
  }

  @Roles(RoleName.CLIENT)
  @Get('subscriptions/mine')
  findMySubscriptions(@CurrentUser() user: AuthenticatedUser) {
    return this.b2bService.findSubscriptions(user.clientId ?? undefined);
  }

  @Patch('subscriptions/:id')
  updateSubscription(@Param('id') id: string, @Body() dto: any) {
    return this.b2bService.updateSubscription(id, dto);
  }
}
