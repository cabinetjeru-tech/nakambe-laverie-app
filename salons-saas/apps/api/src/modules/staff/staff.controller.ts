import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { CommissionRuleDto, CreateStaffDto, ScheduleDto, StaffSkillsDto, TimeOffDto, UpdateStaffDto } from './dto/staff.dto';
import { StaffService } from './staff.service';

@Controller()
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @RequireAnyPermission('staff.read', 'appointments.read', 'appointments.create', 'sales.create')
  @Get('staff')
  list(@CurrentUser() user: AuthUser, @Query('includeInactive') includeInactive?: string) {
    return this.staff.list(user, includeInactive === 'true');
  }

  @RequirePermissions('staff.read')
  @Get('staff/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.staff.detail(user, id);
  }

  @RequirePermissions('staff.manage')
  @Post('staff')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staff.create(user, dto);
  }

  @RequirePermissions('staff.manage')
  @Patch('staff/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(user, id, dto);
  }

  @RequirePermissions('staff.manage')
  @Put('staff/:id/skills')
  skills(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: StaffSkillsDto) {
    return this.staff.setSkills(user, id, dto);
  }

  @RequirePermissions('staff.schedule.manage')
  @Put('staff/:id/schedule')
  schedule(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: ScheduleDto) {
    return this.staff.setSchedule(user, id, dto);
  }

  @RequirePermissions('staff.read')
  @Get('staff/:id/time-off')
  timeOff(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.staff.listTimeOff(user, id, from, to);
  }

  @RequirePermissions('staff.schedule.manage')
  @Post('staff/:id/time-off')
  addTimeOff(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: TimeOffDto) {
    return this.staff.addTimeOff(user, id, dto);
  }

  @RequirePermissions('staff.schedule.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('staff/:id/time-off/:timeOffId')
  removeTimeOff(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Param('timeOffId', ParseIdPipe) timeOffId: string) {
    return this.staff.removeTimeOff(user, id, timeOffId);
  }

  @RequireAnyPermission('commissions.read', 'commissions.rules.manage')
  @Get('commission-rules')
  commissionRules() {
    return this.staff.listCommissionRules();
  }

  @RequirePermissions('commissions.rules.manage')
  @Post('commission-rules')
  createCommissionRule(@Body() dto: CommissionRuleDto) {
    return this.staff.createCommissionRule(dto);
  }

  @RequirePermissions('commissions.rules.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('commission-rules/:id')
  closeCommissionRule(@Param('id', ParseIdPipe) id: string) {
    return this.staff.closeCommissionRule(id);
  }
}
