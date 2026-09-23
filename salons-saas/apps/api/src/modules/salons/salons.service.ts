import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { slugify } from '../../core/http/slug';
import { assertSalonAccess, salonIdFilter } from '../../core/permissions/salon-scope';
import { TenantDefaultsService } from '../../core/tenant/tenant-defaults.service';
import { CreateSalonDto, OpeningHoursDto, UpdateSalonDto } from './dto/salon.dto';

const salonSelect = {
  id: true,
  slug: true,
  name: true,
  city: true,
  phone: true,
  whatsapp: true,
  email: true,
  addressLine: true,
  landmark: true,
  gpsLat: true,
  gpsLng: true,
  timezone: true,
  currency: true,
  status: true,
  onlineBookingEnabled: true,
  bookingMinNoticeMinutes: true,
  bookingMaxAdvanceDays: true,
  cancellationNoticeHours: true,
  defaultDepositPercent: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Salons du tenant. Isolation :
 * - tenant : RLS + filtre automatique (aucun salon d'une autre entreprise n'est atteignable) ;
 * - salon : un membre limité ne voit et ne modifie que les salons de son périmètre.
 */
@Injectable()
export class SalonsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly defaults: TenantDefaultsService,
  ) {}

  list(user: AuthUser) {
    return this.db.tx.salon.findMany({
      where: { deletedAt: null, id: salonIdFilter(user) },
      select: salonSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(user: AuthUser, salonId: string) {
    assertSalonAccess(user, salonId);
    const salon = await this.db.tx.salon.findFirst({ where: { id: salonId, deletedAt: null }, select: salonSelect });
    if (!salon) throw new NotFoundException('Ressource introuvable.');
    return salon;
  }

  async create(user: AuthUser, dto: CreateSalonDto) {
    if (!user.allSalons) {
      throw new ForbiddenException("Seul un membre ayant accès à tous les salons peut en ouvrir un nouveau.");
    }
    const tenant = await this.db.tx.tenant.findUniqueOrThrow({
      where: { id: user.tenantId! },
      select: { plan: { select: { maxSalons: true } } },
    });
    const count = await this.db.tx.salon.count({ where: { deletedAt: null } });
    if (tenant.plan.maxSalons !== null && count >= tenant.plan.maxSalons) {
      throw new ForbiddenException(`Votre offre est limitée à ${tenant.plan.maxSalons} salon(s). Passez à l'offre Multi-salons.`);
    }
    const slug = dto.slug ?? slugify(dto.name);
    await this.assertSlugFree(slug);
    const salon = await this.db.tx.salon.create({
      data: { ...dto, slug, tenantId: user.tenantId! },
      select: salonSelect,
    });
    await this.defaults.openingHoursForNewSalon(salon.id);
    await this.audit.log({ action: 'salon.create', entityType: 'salon', entityId: salon.id, salonId: salon.id, after: { name: salon.name } });
    return salon;
  }

  async update(user: AuthUser, salonId: string, dto: UpdateSalonDto) {
    const before = await this.get(user, salonId);
    if (dto.slug && dto.slug !== before.slug) await this.assertSlugFree(dto.slug);
    const salon = await this.db.tx.salon.update({ where: { id: salonId }, data: dto, select: salonSelect });
    await this.audit.log({
      action: 'salon.update',
      entityType: 'salon',
      entityId: salonId,
      salonId,
      before: JSON.parse(JSON.stringify(before)),
      after: JSON.parse(JSON.stringify(salon)),
    });
    return salon;
  }

  async openingHours(user: AuthUser, salonId: string) {
    await this.get(user, salonId);
    return this.db.tx.salonOpeningHour.findMany({
      where: { salonId },
      select: { weekday: true, opensAt: true, closesAt: true },
      orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }],
    });
  }

  /** Remplace les horaires d'ouverture (plusieurs plages par jour possibles, ex. pause de midi). */
  async setOpeningHours(user: AuthUser, salonId: string, dto: OpeningHoursDto) {
    await this.get(user, salonId);
    const byDay = new Map<number, { opensAt: string; closesAt: string }[]>();
    for (const slot of dto.hours) {
      if (slot.closesAt <= slot.opensAt) throw new BadRequestException("L'heure de fermeture doit suivre l'heure d'ouverture.");
      const day = byDay.get(slot.weekday) ?? [];
      if (day.some((other) => slot.opensAt < other.closesAt && other.opensAt < slot.closesAt)) {
        throw new BadRequestException('Deux plages horaires se chevauchent le même jour.');
      }
      day.push(slot);
      byDay.set(slot.weekday, day);
    }
    await this.db.tx.salonOpeningHour.deleteMany({ where: { salonId } });
    await this.db.tx.salonOpeningHour.createMany({
      data: dto.hours.map((h) => ({ tenantId: user.tenantId!, salonId, weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt })),
    });
    await this.audit.log({ action: 'salon.opening_hours', entityType: 'salon', entityId: salonId, salonId, after: { hours: dto.hours } as never });
    return this.openingHours(user, salonId);
  }

  private async assertSlugFree(slug: string) {
    const taken = await this.db.tx.salon.findFirst({ where: { slug }, select: { id: true } });
    if (taken) throw new ConflictException('Cette adresse de page est déjà utilisée par un autre de vos salons.');
  }
}
