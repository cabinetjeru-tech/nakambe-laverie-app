import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { hasPermission, APPOINTMENT_STATUS_LABELS } from '@dread-royal/shared';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { nextNumber } from '../../common/numbering';

export class CreateAppointmentDto {
  @IsUUID() clientId: string;
  @IsUUID() staffId: string;
  @IsDateString() startAt: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsArray() @ArrayMinSize(1, { message: 'Choisissez au moins une prestation' }) @IsUUID('all', { each: true }) serviceIds: string[];
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class UpdateAppointmentDto {
  @IsOptional() @IsUUID() staffId?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true }) serviceIds?: string[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class StatusDto {
  @IsEnum(AppointmentStatus) status: AppointmentStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
class AppointmentQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
}

const ACTIVE_STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'DONE'];
const include = {
  client: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } },
  staff: { select: { id: true, firstName: true, lastName: true, color: true } },
  items: { include: { service: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.AppointmentInclude;

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private scope(user: AuthUser): Prisma.AppointmentWhereInput {
    if (hasPermission(user.permissions, 'appointments.view_all')) return {};
    return { staffId: user.staffId ?? '00000000-0000-0000-0000-000000000000' };
  }

  async list(q: AppointmentQuery, user: AuthUser) {
    const where: Prisma.AppointmentWhereInput = { AND: [this.scope(user)] };
    const and = where.AND as Prisma.AppointmentWhereInput[];
    if (q.from) and.push({ endAt: { gt: new Date(q.from) } });
    if (q.to) and.push({ startAt: { lt: new Date(q.to) } });
    if (q.staffId) and.push({ staffId: q.staffId });
    if (q.clientId) and.push({ clientId: q.clientId });
    if (q.status) and.push({ status: { in: q.status.split(',') as AppointmentStatus[] } });
    if (q.search) and.push({ OR: [{ code: { contains: q.search, mode: 'insensitive' } }, { client: { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search.replace(/\s/g, '') } }] } }] });
    return this.prisma.appointment.findMany({ where, include, orderBy: { startAt: 'asc' }, take: 1000 });
  }

  async get(id: string, user: AuthUser) {
    const a = await this.prisma.appointment.findFirst({ where: { AND: [{ id }, this.scope(user)] }, include: { ...include, sales: { select: { id: true, number: true, total: true, paymentStatus: true, status: true } } } });
    if (!a) throw new NotFoundException('Rendez-vous introuvable');
    return a;
  }

  /**
   * Vérifie qu'aucun rendez-vous actif du même coiffeur ne chevauche [start, end).
   * Un verrou consultatif PostgreSQL par coiffeur sérialise les réservations concurrentes.
   */
  async assertSlotFree(tx: Tx, staffId: string, start: Date, end: Date, excludeId?: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'appt:' + staffId}))`;
    const clash = await tx.appointment.findFirst({
      where: { staffId, status: { in: ACTIVE_STATUSES }, startAt: { lt: end }, endAt: { gt: start }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      include: { client: { select: { firstName: true, lastName: true } } },
    });
    if (clash) {
      const h = (d: Date) => d.toISOString().slice(11, 16);
      throw new ConflictException(`Créneau indisponible : ce coiffeur a déjà un rendez-vous de ${h(clash.startAt)} à ${h(clash.endAt)} (${clash.client.firstName} ${clash.client.lastName})`);
    }
  }

  private async loadServices(tx: Tx, ids: string[]) {
    const services = await tx.service.findMany({ where: { id: { in: ids }, active: true } });
    if (services.length !== new Set(ids).size) throw new BadRequestException('Prestation inconnue ou inactive');
    return ids.map((id) => services.find((s) => s.id === id)!);
  }

  private async checkStaff(tx: Tx, staffId: string) {
    const staff = await tx.staff.findUnique({ where: { id: staffId } });
    if (!staff || staff.status !== 'ACTIVE') throw new BadRequestException('Coiffeur inconnu ou indisponible');
  }

  async create(dto: CreateAppointmentDto, user: AuthUser, ip?: string, txIn?: Tx) {
    const run = async (tx: Tx) => {
      const client = await tx.client.findUnique({ where: { id: dto.clientId } });
      if (!client || !client.active) throw new BadRequestException('Client inconnu');
      await this.checkStaff(tx, dto.staffId);
      const services = await this.loadServices(tx, dto.serviceIds);
      const start = new Date(dto.startAt);
      const duration = services.reduce((s, x) => s + x.durationMin, 0);
      const end = dto.endAt ? new Date(dto.endAt) : new Date(start.getTime() + duration * 60_000);
      if (end <= start) throw new BadRequestException("L'heure de fin doit être après l'heure de début");
      await this.assertSlotFree(tx, dto.staffId, start, end);
      const code = await nextNumber(tx, 'RDV', 6, start);
      const a = await tx.appointment.create({
        data: {
          code, clientId: dto.clientId, staffId: dto.staffId, startAt: start, endAt: end, status: dto.status ?? 'CONFIRMED', notes: dto.notes, createdById: user.id,
          items: { create: services.map((s) => ({ serviceId: s.id, price: s.price, durationMin: s.durationMin })) },
        },
        include,
      });
      await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'Appointment', entityId: a.id, summary: `RDV ${a.code} — ${client.firstName} ${client.lastName}`, after: a, ip }, tx);
      return a;
    };
    return txIn ? run(txIn) : this.prisma.tx(run);
  }

  async update(id: string, dto: UpdateAppointmentDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.appointment.findUnique({ where: { id }, include });
      if (!before) throw new NotFoundException('Rendez-vous introuvable');
      if (['DONE', 'CANCELLED', 'NO_SHOW'].includes(before.status)) throw new BadRequestException('Ce rendez-vous est clôturé et ne peut plus être modifié');
      const staffId = dto.staffId ?? before.staffId;
      if (dto.staffId) await this.checkStaff(tx, dto.staffId);
      let duration = (before.endAt.getTime() - before.startAt.getTime()) / 60_000;
      let items: Prisma.AppointmentItemCreateWithoutAppointmentInput[] | undefined;
      if (dto.serviceIds) {
        const services = await this.loadServices(tx, dto.serviceIds);
        duration = services.reduce((s, x) => s + x.durationMin, 0);
        items = services.map((s) => ({ service: { connect: { id: s.id } }, price: s.price, durationMin: s.durationMin }));
      }
      const start = dto.startAt ? new Date(dto.startAt) : before.startAt;
      const end = dto.endAt ? new Date(dto.endAt) : dto.startAt || dto.serviceIds ? new Date(start.getTime() + duration * 60_000) : before.endAt;
      if (end <= start) throw new BadRequestException("L'heure de fin doit être après l'heure de début");
      await this.assertSlotFree(tx, staffId, start, end, id);
      if (items) await tx.appointmentItem.deleteMany({ where: { appointmentId: id } });
      const a = await tx.appointment.update({
        where: { id },
        data: { staffId, startAt: start, endAt: end, notes: dto.notes ?? before.notes, ...(items ? { items: { create: items } } : {}) },
        include,
      });
      await this.audit.log({ userId: user.id, action: 'UPDATE', entity: 'Appointment', entityId: id, summary: `RDV ${a.code} modifié`, before, after: a, ip }, tx);
      return a;
    });
  }

  async setStatus(id: string, dto: StatusDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const a = await tx.appointment.findUnique({ where: { id } });
      if (!a) throw new NotFoundException('Rendez-vous introuvable');
      const canManage = hasPermission(user.permissions, 'appointments.manage');
      if (!canManage) {
        // Coiffeur : uniquement ses rendez-vous, et pas d'annulation
        if (a.staffId !== user.staffId) throw new ForbiddenException("Ce rendez-vous n'est pas dans votre planning");
        if (dto.status === 'CANCELLED') throw new ForbiddenException("L'annulation est réservée à l'accueil / au responsable");
      }
      if (dto.status === 'CANCELLED' && !dto.reason?.trim()) throw new BadRequestException("Indiquez le motif de l'annulation");
      if (['CANCELLED', 'NO_SHOW'].includes(a.status) && ACTIVE_STATUSES.includes(dto.status)) {
        // Réactivation : vérifier que le créneau est toujours libre
        await this.assertSlotFree(tx, a.staffId, a.startAt, a.endAt, a.id);
      }
      const updated = await tx.appointment.update({ where: { id }, data: { status: dto.status, cancelReason: dto.status === 'CANCELLED' ? dto.reason : a.cancelReason }, include });
      await this.audit.log({ userId: user.id, action: 'STATUS', entity: 'Appointment', entityId: id, summary: `RDV ${a.code} : ${APPOINTMENT_STATUS_LABELS[a.status]} → ${APPOINTMENT_STATUS_LABELS[dto.status]}${dto.reason ? ` (${dto.reason})` : ''}`, ip }, tx);
      return updated;
    });
  }
}

@Controller('appointments')
export class AppointmentsController {
  constructor(private s: AppointmentsService) {}
  @Get() @RequirePermissions('appointments.view_all', 'appointments.view_own')
  list(@Query() q: AppointmentQuery, @CurrentUser() u: AuthUser) { return this.s.list(q, u); }
  @Get(':id') @RequirePermissions('appointments.view_all', 'appointments.view_own')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.s.get(id, u); }
  @Post() @RequirePermissions('appointments.manage')
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.create(dto, u, ip); }
  @Patch(':id') @RequirePermissions('appointments.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAppointmentDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.update(id, dto, u, ip); }
  @Patch(':id/status') @RequirePermissions('appointments.manage', 'appointments.update_status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.setStatus(id, dto, u, ip); }
}

@Module({ controllers: [AppointmentsController], providers: [AppointmentsService], exports: [AppointmentsService] })
export class AppointmentsModule {}
