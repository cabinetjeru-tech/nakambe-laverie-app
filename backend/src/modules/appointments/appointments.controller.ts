import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppointmentStatus, RoleName } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private appointmentsService: AppointmentsService) {}

  @Roles(
    RoleName.CLIENT,
    RoleName.ADMIN,
    RoleName.GERANT,
    RoleName.RECEPTIONNISTE,
  )
  @Post()
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    const requestingClientId = user.role === RoleName.CLIENT ? user.clientId ?? undefined : undefined;
    return this.appointmentsService.create(dto, requestingClientId);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Get()
  findAll(@Query('status') status?: AppointmentStatus) {
    return this.appointmentsService.findAll(status);
  }

  @Get('mine')
  @Roles(RoleName.CLIENT)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.findAll(undefined, user.clientId ?? undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: AppointmentStatus) {
    return this.appointmentsService.updateStatus(id, status);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Patch(':id/reschedule')
  reschedule(@Param('id') id: string, @Body('scheduledDate') scheduledDate: string) {
    return this.appointmentsService.reschedule(id, scheduledDate);
  }
}
