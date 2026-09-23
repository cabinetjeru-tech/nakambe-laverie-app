import { randomInt } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime, Interval } from 'luxon';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { assertSalonAccess, canAccessSalon, salonIdFilter } from '../../core/permissions/salon-scope';
import { StaffIdentityService } from '../../core/tenant/staff-identity.service';
import { parseLocalDate, subtractIntervals } from '../../core/time/zoned';
import { blockingRanges, computeTiming } from '../catalog/service-timing';
import { AvailabilityService, SalonForAgenda } from './availability.service';
import {
  AgendaQueryDto,
  AppointmentItemDto,
  AppointmentListQueryDto,
  AppointmentStatusValue,
  AvailabilityQueryDto,
  ChangeStatusDto,
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto';

const ACTIVE: AppointmentStatusValue[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'];
const CANCELLING: AppointmentStatusValue[] = ['CANCELLED_BY_CLIENT', 'CANCELLED_BY_SALON', 'NO_SHOW'];

/** Transitions autorisées du cycle de vie d'un rendez-vous. */
const TRANSITIONS: Record<AppointmentStatusValue, AppointmentStatusValue[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_SALON'],
  CONFIRMED: ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_SALON', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_SALON'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED_BY_CLIENT: [],
  CANCELLED_BY_SALON: [],
  NO_SHOW: [],
};

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const appointmentSelect = {
  id: true,
  reference: true,
  salonId: true,
  status: true,
  channel: true,
  startsAt: true,
  endsAt: true,
  estimatedTotal: true,
  clientNote: true,
  internalNote: true,
  cancellationReason: true,
  checkedInAt: true,
  completedAt: true,
  createdAt: true,
  client: { select: { id: true, fullName: true, phone: true, clientNumber: true } },
  items: {
    select: {
      id: true,
      serviceId: true,
      variantId: true,
      serviceName: true,
      startsAt: true,
      endsAt: true,
      durationMinutes: true,
      price: true,
      staff: { select: { id: true, displayName: true, calendarColor: true } },
    },
    orderBy: { position: 'asc' },
  },
  sales: { where: { status: { not: 'VOIDED' } }, select: { id: true, number: true, status: true } },
} satisfies Prisma.AppointmentSelect;

interface PlannedItem {
  dto: AppointmentItemDto;
  serviceName: string;
  price: bigint;
  durationMinutes: number;
  start: DateTime;
  end: DateTime;
  blocking: { start: DateTime; end: DateTime }[];
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly db: DbService,
    private readonly availability: AvailabilityService,
    private readonly staffIdentity: StaffIdentityService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ Lecture

  async list(user: AuthUser, query: AppointmentListQueryDto) {
    if (query.salonId) assertSalonAccess(user, query.salonId);
    const ownStaffId = await this.ownOnlyStaffId(user);
    const from = query.from ? new Date(query.from) : DateTime.now().startOf('day').toJSDate();
    const to = query.to ? new Date(query.to) : DateTime.fromJSDate(from).plus({ days: 7 }).toJSDate();
    if (to <= from) throw new BadRequestException('Période invalide.');
    const staffFilter = ownStaffId ?? query.staffId;
    return this.db.tx.appointment.findMany({
      where: {
        salonId: query.salonId ?? salonIdFilter(user),
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(query.status ? { status: query.status } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(staffFilter ? { items: { some: { staffId: staffFilter } } } : {}),
      },
      select: appointmentSelect,
      orderBy: { startsAt: 'asc' },
      take: 500,
    });
  }

  async get(user: AuthUser, id: string) {
    const appointment = await this.db.tx.appointment.findFirst({ where: { id }, select: appointmentSelect });
    if (!appointment || !canAccessSalon(user, appointment.salonId)) throw new NotFoundException('Rendez-vous introuvable.');
    const ownStaffId = await this.ownOnlyStaffId(user);
    if (ownStaffId && !appointment.items.some((i) => i.staff.id === ownStaffId)) throw new NotFoundException('Rendez-vous introuvable.');
    return appointment;
  }

  /** Vue « planning du jour » : colonnes des employés, heures de travail, rendez-vous. */
  async agenda(user: AuthUser, query: AgendaQueryDto) {
    assertSalonAccess(user, query.salonId);
    const salon = await this.salon(query.salonId);
    const day = parseLocalDate(query.date, salon.timezone);
    const opening = await this.availability.salonWindows(salon, day);
    const ownStaffId = await this.ownOnlyStaffId(user);

    const staff = await this.db.tx.staffMember.findMany({
      where: { isActive: true, salons: { some: { salonId: salon.id } }, ...(ownStaffId ? { id: ownStaffId } : {}) },
      select: { id: true, displayName: true, calendarColor: true },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    });
    const columns = await Promise.all(
      staff.map(async (s) => ({
        ...s,
        workingHours: (await this.availability.staffWorkingWindows(s.id, salon, day, opening)).map((i) => ({
          start: i.start!.toISO(),
          end: i.end!.toISO(),
        })),
      })),
    );
    const appointments = await this.list(user, {
      salonId: salon.id,
      from: day.toISO()!,
      to: day.plus({ days: 1 }).toISO()!,
    });
    return {
      date: query.date,
      timezone: salon.timezone,
      opening: opening.map((i) => ({ start: i.start!.toISO(), end: i.end!.toISO() })),
      staff: columns,
      appointments,
    };
  }

  /** Créneaux libres pour une prestation, par employé. */
  async availableSlots(user: AuthUser, query: AvailabilityQueryDto) {
    assertSalonAccess(user, query.salonId);
    const salon = await this.salon(query.salonId);
    const day = parseLocalDate(query.date, salon.timezone);
    const service = await this.service(query.serviceId);
    const variant = query.variantId ? service.variants.find((v) => v.id === query.variantId) : null;
    if (query.variantId && !variant) throw new BadRequestException('Variante inconnue.');

    const skills = await this.db.tx.staffSkill.findMany({
      where: {
        serviceId: service.id,
        ...(query.staffId ? { staffId: query.staffId } : {}),
        staff: { isActive: true, salons: { some: { salonId: salon.id } } },
      },
      select: { staffId: true, priceOverride: true, durationFactor: true, staff: { select: { displayName: true } } },
    });
    const notBefore = DateTime.now().setZone(salon.timezone);
    const result = [];
    for (const skill of skills) {
      const timing = computeTiming(service, variant, skill);
      const starts = await this.availability.freeStarts({
        staffId: skill.staffId,
        salon,
        day,
        durationMinutes: timing.durationMinutes,
        blocking: blockingRanges(timing.segments),
        notBefore,
      });
      result.push({
        staffId: skill.staffId,
        staffName: skill.staff.displayName,
        price: timing.price,
        durationMinutes: timing.durationMinutes,
        slots: starts.map((s) => s.toISO()),
      });
    }
    return { date: query.date, timezone: salon.timezone, staff: result };
  }

  // ------------------------------------------------------------------ Écriture

  async create(user: AuthUser, dto: CreateAppointmentDto) {
    assertSalonAccess(user, dto.salonId);
    this.assertForceAllowed(user, dto.force);
    const salon = await this.salon(dto.salonId);
    if (dto.clientId) await this.assertClient(dto.clientId);

    const start = DateTime.fromISO(dto.startsAt).setZone(salon.timezone);
    if (!dto.force && start < DateTime.now().minus({ minutes: 15 })) {
      throw new BadRequestException('Ce créneau est déjà passé.');
    }
    const planned = await this.plan(salon, start, dto.items, !dto.force);
    const end = planned[planned.length - 1].end;

    const appointment = await this.db.tx.appointment.create({
      data: {
        tenantId: this.db.tenantId!,
        salonId: salon.id,
        clientId: dto.clientId ?? null,
        reference: this.reference(),
        status: 'CONFIRMED',
        channel: dto.channel ?? 'COUNTER',
        startsAt: start.toJSDate(),
        endsAt: end.toJSDate(),
        estimatedTotal: planned.reduce((sum, p) => sum + p.price, 0n),
        clientNote: dto.clientNote ?? null,
        internalNote: dto.internalNote ?? null,
        createdBy: user.userId,
      },
      select: { id: true },
    });
    await this.persistItems(appointment.id, planned);
    await this.db.tx.appointmentStatusHistory.createMany({
      data: [{ tenantId: this.db.tenantId!, appointmentId: appointment.id, toStatus: 'CONFIRMED', changedBy: user.userId }],
    });
    await this.audit.log({ action: 'appointment.create', entityType: 'appointment', entityId: appointment.id, salonId: salon.id });
    return this.get(user, appointment.id);
  }

  async reschedule(user: AuthUser, id: string, dto: RescheduleAppointmentDto) {
    this.assertForceAllowed(user, dto.force);
    const current = await this.get(user, id);
    if (!['PENDING', 'CONFIRMED'].includes(current.status)) {
      throw new ConflictException('Seul un rendez-vous à venir peut être déplacé.');
    }
    const salon = await this.salon(current.salonId);
    const items: AppointmentItemDto[] =
      dto.items ?? current.items.map((i) => ({ serviceId: i.serviceId, variantId: i.variantId ?? undefined, staffId: i.staff.id }));
    const start = DateTime.fromISO(dto.startsAt).setZone(salon.timezone);
    if (!dto.force && start < DateTime.now().minus({ minutes: 15 })) throw new BadRequestException('Ce créneau est déjà passé.');

    // Les anciennes occupations disparaissent avec les anciennes lignes, dans la même transaction.
    await this.db.tx.appointmentItem.deleteMany({ where: { appointmentId: id } });
    const planned = await this.plan(salon, start, items, !dto.force);
    await this.db.tx.appointment.update({
      where: { id },
      data: {
        startsAt: start.toJSDate(),
        endsAt: planned[planned.length - 1].end.toJSDate(),
        estimatedTotal: planned.reduce((sum, p) => sum + p.price, 0n),
        version: { increment: 1 },
      },
    });
    await this.persistItems(id, planned);
    await this.audit.log({
      action: 'appointment.reschedule',
      entityType: 'appointment',
      entityId: id,
      salonId: salon.id,
      before: { startsAt: current.startsAt.toISOString() },
      after: { startsAt: start.toISO() },
    });
    return this.get(user, id);
  }

  async changeStatus(user: AuthUser, id: string, dto: ChangeStatusDto) {
    const appointment = await this.get(user, id);
    const from = appointment.status as AppointmentStatusValue;
    if (!TRANSITIONS[from].includes(dto.status)) {
      throw new ConflictException(`Passage impossible de « ${from} » à « ${dto.status} ».`);
    }
    await this.assertMayChangeStatus(user, appointment, dto.status);

    const now = new Date();
    await this.db.tx.appointment.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === 'CHECKED_IN' ? { checkedInAt: now } : {}),
        ...(dto.status === 'IN_PROGRESS' && !appointment.checkedInAt ? { checkedInAt: now } : {}),
        ...(dto.status === 'COMPLETED' ? { completedAt: now } : {}),
        ...(CANCELLING.includes(dto.status) ? { cancelledAt: now, cancellationReason: dto.reason ?? null } : {}),
        version: { increment: 1 },
      },
    });
    if (CANCELLING.includes(dto.status)) {
      // Le créneau est libéré immédiatement pour d'autres clients.
      await this.db.tx.staffBusySlot.updateMany({ where: { item: { appointmentId: id } }, data: { isActive: false } });
      await this.db.tx.resourceBusySlot.updateMany({ where: { item: { appointmentId: id } }, data: { isActive: false } });
    }
    if (dto.status === 'NO_SHOW' && appointment.client) {
      await this.db.tx.clientProfile.update({ where: { id: appointment.client.id }, data: { noShowCount: { increment: 1 } } });
    }
    await this.db.tx.appointmentStatusHistory.createMany({
      data: [{ tenantId: this.db.tenantId!, appointmentId: id, fromStatus: from, toStatus: dto.status, reason: dto.reason ?? null, changedBy: user.userId }],
    });
    await this.audit.log({ action: 'appointment.status', entityType: 'appointment', entityId: id, salonId: appointment.salonId, before: { status: from }, after: { status: dto.status } });
    return this.get(user, id);
  }

  async statusHistory(user: AuthUser, id: string) {
    await this.get(user, id);
    return this.db.tx.appointmentStatusHistory.findMany({
      where: { appointmentId: id },
      select: { fromStatus: true, toStatus: true, reason: true, changedBy: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ------------------------------------------------------------------ Outils

  /**
   * Enchaîne les prestations à partir de l'heure de début et vérifie (sauf forçage) que
   * chaque étape bloquante tombe dans les heures de travail de l'employé. Les conflits
   * avec d'autres rendez-vous sont refusés par PostgreSQL (contrainte d'exclusion).
   */
  private async plan(salon: SalonForAgenda, start: DateTime, items: AppointmentItemDto[], enforceHours: boolean): Promise<PlannedItem[]> {
    const planned: PlannedItem[] = [];
    let cursor = start;
    for (const item of items) {
      const service = await this.service(item.serviceId);
      const variant = item.variantId ? service.variants.find((v) => v.id === item.variantId) : null;
      if (item.variantId && !variant) throw new BadRequestException('Variante inconnue.');
      const staff = await this.db.tx.staffMember.findFirst({
        where: { id: item.staffId, isActive: true, salons: { some: { salonId: salon.id } } },
        select: { id: true, displayName: true },
      });
      if (!staff) throw new BadRequestException("Employé inconnu ou non rattaché à ce salon.");
      const skill = await this.db.tx.staffSkill.findFirst({ where: { staffId: staff.id, serviceId: service.id } });
      if (!skill) throw new BadRequestException(`${staff.displayName} ne réalise pas la prestation « ${service.name} ».`);

      const timing = computeTiming(service, variant, skill);
      const itemEnd = cursor.plus({ minutes: timing.durationMinutes });
      const blocking = blockingRanges(timing.segments).map((r) => ({
        start: cursor.plus({ minutes: r.offsetMinutes }),
        end: cursor.plus({ minutes: r.offsetMinutes + r.durationMinutes }),
      }));

      if (enforceHours) {
        const day = cursor.startOf('day');
        const opening = await this.availability.salonWindows(salon, day);
        const working = await this.availability.staffWorkingWindows(staff.id, salon, day, opening);
        if (!opening.some((o) => o.engulfs(Interval.fromDateTimes(cursor, itemEnd)))) {
          throw new ConflictException('Le salon est fermé sur une partie de ce créneau.');
        }
        const free = subtractIntervals(working, []);
        if (!blocking.every((b) => free.some((w) => w.engulfs(Interval.fromDateTimes(b.start, b.end))))) {
          throw new ConflictException(`${staff.displayName} ne travaille pas sur ce créneau (planning ou absence).`);
        }
      }

      planned.push({
        dto: item,
        serviceName: variant ? `${service.name} — ${variant.name}` : service.name,
        price: timing.price,
        durationMinutes: timing.durationMinutes,
        start: cursor,
        end: itemEnd,
        blocking,
      });
      cursor = itemEnd;
    }
    return planned;
  }

  private async persistItems(appointmentId: string, planned: PlannedItem[]) {
    const tenantId = this.db.tenantId!;
    for (const [index, item] of planned.entries()) {
      const created = await this.db.tx.appointmentItem.create({
        data: {
          tenantId,
          appointmentId,
          serviceId: item.dto.serviceId,
          variantId: item.dto.variantId ?? null,
          staffId: item.dto.staffId,
          position: index + 1,
          serviceName: item.serviceName,
          startsAt: item.start.toJSDate(),
          endsAt: item.end.toJSDate(),
          durationMinutes: item.durationMinutes,
          price: item.price,
        },
        select: { id: true },
      });
      try {
        await this.db.tx.staffBusySlot.createMany({
          data: item.blocking.map((b) => ({
            tenantId,
            staffId: item.dto.staffId,
            itemId: created.id,
            startsAt: b.start.toJSDate(),
            endsAt: b.end.toJSDate(),
          })),
        });
      } catch (error) {
        if (String(error).includes('23P01') || String(error).includes('no_overlap')) {
          throw new ConflictException('Ce créneau vient d’être pris pour cet employé. Choisissez-en un autre.');
        }
        throw error;
      }
    }
  }

  private async assertMayChangeStatus(user: AuthUser, appointment: { items: { staff: { id: string } }[] }, status: AppointmentStatusValue) {
    if (CANCELLING.includes(status)) {
      if (!user.permissions.includes('appointments.cancel')) {
        throw new ForbiddenException("Vous n'avez pas la permission d'annuler un rendez-vous.");
      }
      return;
    }
    if (user.permissions.includes('appointments.manage')) return;
    // Un coiffeur fait avancer ses propres rendez-vous (arrivée, début, fin).
    const ownStaffId = user.permissions.includes('appointments.read.own') ? await this.staffIdentity.ownStaffId(user) : null;
    if (!ownStaffId || !appointment.items.every((i) => i.staff.id === ownStaffId)) {
      throw new ForbiddenException("Vous n'avez pas la permission de modifier ce rendez-vous.");
    }
  }

  private assertForceAllowed(user: AuthUser, force?: boolean) {
    if (force && !user.permissions.includes('appointments.manage')) {
      throw new ForbiddenException('Réserver hors des horaires nécessite la permission de gérer l’agenda.');
    }
  }

  /** Membre ne voyant que son propre agenda : renvoie son profil, sinon null. */
  private async ownOnlyStaffId(user: AuthUser): Promise<string | null> {
    if (user.permissions.includes('appointments.read')) return null;
    if (!user.permissions.includes('appointments.read.own')) {
      throw new ForbiddenException("Vous n'avez pas accès à l'agenda.");
    }
    return this.staffIdentity.requireOwnStaffId(user);
  }

  private async salon(salonId: string): Promise<SalonForAgenda & { name: string }> {
    const salon = await this.db.tx.salon.findFirst({
      where: { id: salonId, deletedAt: null },
      select: { id: true, name: true, timezone: true, slotIntervalMinutes: true },
    });
    if (!salon) throw new NotFoundException('Salon introuvable.');
    return salon;
  }

  private async service(serviceId: string) {
    const service = await this.db.tx.service.findFirst({
      where: { id: serviceId, deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        basePrice: true,
        durationMinutes: true,
        steps: { select: { position: true, durationMinutes: true, blocksStaff: true } },
        variants: { where: { isActive: true }, select: { id: true, name: true, price: true, durationMinutes: true } },
      },
    });
    if (!service) throw new BadRequestException('Prestation inconnue ou désactivée.');
    return service;
  }

  private async assertClient(clientId: string) {
    const client = await this.db.tx.clientProfile.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
    if (!client) throw new BadRequestException('Client inconnu.');
  }

  private reference(): string {
    return Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('');
  }
}

export { ACTIVE as ACTIVE_APPOINTMENT_STATUSES };
