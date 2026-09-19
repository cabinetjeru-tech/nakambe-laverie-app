import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private quotesService: QuotesService,
  ) {}

  async create(dto: CreateAppointmentDto, requestingClientId?: string) {
    const clientId = requestingClientId ?? dto.clientId;
    if (!clientId) {
      throw new BadRequestException('clientId est requis.');
    }

    // La demande est chiffrée (quantités précises) : un devis est généré immédiatement,
    // avec les tarifs officiels du catalogue (jamais le prix envoyé par le client).
    let quoteId: string | undefined;
    if (dto.items?.length) {
      const quote = await this.quotesService.create(
        {
          items: dto.items.map((item) => ({ serviceId: item.serviceId, label: '', quantity: item.quantity })),
          conditions: 'Devis généré automatiquement suite à une demande en ligne.',
        },
        clientId,
      );
      quoteId = quote.id;
    }

    return this.prisma.appointment.create({
      data: {
        clientId,
        zoneId: dto.zoneId,
        domain: dto.domain,
        mode: dto.mode,
        scheduledDate: new Date(dto.scheduledDate),
        address: dto.address,
        gpsLat: dto.gpsLat,
        gpsLng: dto.gpsLng,
        gpsAccuracy: dto.gpsAccuracy,
        quantityNote: dto.quantityNote,
        comment: dto.comment,
        photoUrls: dto.photoUrls ?? [],
        paymentTiming: dto.paymentTiming,
        quoteId,
      },
      include: { quote: { include: { items: true } } },
    });
  }

  findAll(status?: AppointmentStatus, clientId?: string) {
    return this.prisma.appointment.findMany({
      where: { ...(status ? { status } : {}), ...(clientId ? { clientId } : {}) },
      include: { client: true, zone: true, quote: { include: { items: true } } },
      orderBy: { scheduledDate: 'asc' },
    });
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { client: true, zone: true, order: true, quote: { include: { items: true } } },
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
