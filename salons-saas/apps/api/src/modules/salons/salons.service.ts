import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { slugify } from '../../core/http/slug';
import { assertSalonAccess, salonIdFilter } from '../../core/permissions/salon-scope';
import { CreateSalonDto, UpdateSalonDto } from './dto/salon.dto';

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

  private async assertSlugFree(slug: string) {
    const taken = await this.db.tx.salon.findFirst({ where: { slug }, select: { id: true } });
    if (taken) throw new ConflictException('Cette adresse de page est déjà utilisée par un autre de vos salons.');
  }
}
