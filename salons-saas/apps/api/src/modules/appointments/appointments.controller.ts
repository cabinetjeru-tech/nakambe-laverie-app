import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { AppointmentsService } from './appointments.service';
import {
  AgendaQueryDto,
  AppointmentListQueryDto,
  AvailabilityQueryDto,
  ChangeStatusDto,
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @RequireAnyPermission('appointments.read', 'appointments.read.own')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AppointmentListQueryDto) {
    return this.appointments.list(user, query);
  }

  @RequireAnyPermission('appointments.read', 'appointments.read.own')
  @Get('agenda')
  agenda(@CurrentUser() user: AuthUser, @Query() query: AgendaQueryDto) {
    return this.appointments.agenda(user, query);
  }

  @RequirePermissions('appointments.create')
  @Get('availability')
  availability(@CurrentUser() user: AuthUser, @Query() query: AvailabilityQueryDto) {
    return this.appointments.availableSlots(user, query);
  }

  @RequireAnyPermission('appointments.read', 'appointments.read.own')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.appointments.get(user, id);
  }

  @RequireAnyPermission('appointments.read', 'appointments.read.own')
  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.appointments.statusHistory(user, id);
  }

  @RequirePermissions('appointments.create')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(user, dto);
  }

  @RequirePermissions('appointments.manage')
  @Patch(':id')
  reschedule(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: RescheduleAppointmentDto) {
    return this.appointments.reschedule(user, id, dto);
  }

  @RequireAnyPermission('appointments.manage', 'appointments.cancel', 'appointments.read.own')
  @HttpCode(HttpStatus.OK)
  @Post(':id/status')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: ChangeStatusDto) {
    return this.appointments.changeStatus(user, id, dto);
  }
}
