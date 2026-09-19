import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAppointmentDto, requestingClientId?: string) {
    const clientId = requestingClientId ?? dto.clientId;
    if (!clientId) {
      throw new BadRequestException('clientId est requis.');
    }
    return this.prisma.appointment.create({
      data: {
        clientId,
        zoneId: dto.zoneId,
        domain: dto.domain,
        mode: dto.mode,
        scheduledDate: new Date(dto.scheduledDate),
        address: dto.address,
        quantityNote: dto.quantityNote,
        comment: dto.comment,
        photoUrls: dto.photoUrls ?? [],
      },
    });
  }

  findAll(status?: AppointmentStatus, clientId?: string) {
    return this.prisma.appointment.findMany({
      where: { ...(status ? { status } : {}), ...(clientId ? { clientId } : {}) },
      include: { client: true, zone: true },
      orderBy: { scheduledDate: 'asc' },
    });
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { client: true, zone: true, order: true },
    });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');
    return appointment;
  }

  async updateStatus(id: string, status: AppointmentStatus) {
    await this.findOne(id);
    return this.prisma.appointment.update({ where: { id }, data: { status } });
  }

  async reschedule(id: string, scheduledDate: string) {
    await this.findOne(id);
    return this.prisma.appointment.update({
      where: { id },
      data: { scheduledDate: new Date(scheduledDate), status: AppointmentStatus.REPROGRAMME },
    });
  }
}
