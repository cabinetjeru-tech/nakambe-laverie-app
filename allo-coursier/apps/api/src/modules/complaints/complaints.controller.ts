import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { ComplaintMessageDto, ComplaintQueryDto, CreateComplaintDto, UpdateComplaintDto } from './complaints.dto';
import { ComplaintsService } from './complaints.service';

@ApiTags('Réclamations')
@ApiBearerAuth()
@Controller()
export class ComplaintsController {
  constructor(private complaints: ComplaintsService) {}

  @Post('complaints')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(user, dto);
  }

  @Get('complaints')
  mine(@CurrentUser() user: AuthUser) {
    return this.complaints.mine(user.id);
  }

  @Get('complaints/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.complaints.detail(user, id);
  }

  @Post('complaints/:id/messages')
  message(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ComplaintMessageDto) {
    return this.complaints.addMessage(user, id, dto);
  }

  @Get('admin/complaints')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_MANAGE.code)
  list(@Query() query: ComplaintQueryDto) {
    return this.complaints.list(query);
  }

  @Patch('admin/complaints/:id')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_MANAGE.code)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateComplaintDto, @CurrentUser() user: AuthUser) {
    return this.complaints.update(id, dto, user);
  }
}
