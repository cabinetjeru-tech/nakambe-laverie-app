import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { toMoney } from '../../core/http/money';
import { canAccessSalon } from '../../core/permissions/salon-scope';
import { TenantDefaultsService } from '../../core/tenant/tenant-defaults.service';
import { CommissionRuleDto, CreateStaffDto, ScheduleDto, StaffSkillsDto, TimeOffDto, UpdateStaffDto } from './dto/staff.dto';

const staffSelect = {
  id: true,
  displayName: true,
  phone: true,
  photoKey: true,
  bio: true,
  calendarColor: true,
  contractType: true,
  baseSalary: true,
  bookableOnline: true,
  isActive: true,
  membershipId: true,
  membership: {
    select: {
      status: true,
      user: { select: { fullName: true, phone: true } },
      roles: { select: { role: { select: { code: true, name: true } } } },
    },
  },
  salons: { select: { salonId: true } },
  skills: { select: { serviceId: true, priceOverride: true, durationFactor: true } },
} as const;

/**
 * Employés : profil professionnel, salons, prestations réalisées, planning, absences.
 * Un membre limité à certains salons ne voit et ne gère que les employés de son périmètre.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly defaults: TenantDefaultsService,
  ) {}

  async list(user: AuthUser, includeInactive = false) {
    const staff = await this.db.tx.staffMember.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(user.allSalons ? {} : { salons: { some: { salonId: { in: user.salonIds } } } }),
      },
      select: staffSelect,
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    });
    return staff.map((s) => this.present(s));
  }

  async get(user: AuthUser, staffId: string) {
    const staff = await this.db.tx.staffMember.findFirst({ where: { id: staffId }, select: staffSelect });
    if (!staff || !this.isVisible(user, staff.salons.map((s) => s.salonId))) throw new NotFoundException('Employé introuvable.');
    return staff;
  }

  async detail(user: AuthUser, staffId: string) {
    const staff = await this.get(user, staffId);
    const schedules = await this.db.tx.staffSchedule.findMany({
      where: { staffId },
      select: { salonId: true, weekday: true, startsAt: true, endsAt: true },
      orderBy: [{ salonId: 'asc' }, { weekday: 'asc' }, { startsAt: 'asc' }],
    });
    const timeOff = await this.db.tx.staffTimeOff.findMany({
      where: { staffId, endsAt: { gt: new Date() } },
      select: { id: true, type: true, startsAt: true, endsAt: true, note: true },
      orderBy: { startsAt: 'asc' },
    });
    return { ...this.present(staff), schedules, upcomingTimeOff: timeOff };
  }

  /** Employé sans compte de connexion (apprenti, coiffeur sans smartphone…). */
  async create(user: AuthUser, dto: CreateStaffDto) {
    this.assertSalonsInScope(user, dto.salonIds);
    await this.assertSalonsExist(dto.salonIds);
    await this.assertQuota();
    const tenantId = this.db.tenantId!;

    const staff = await this.db.tx.staffMember.create({
      data: {
        tenantId,
        displayName: dto.displayName,
        phone: dto.phone ?? null,
        contractType: dto.contractType ?? 'EMPLOYEE',
        calendarColor: dto.calendarColor ?? '#2F80ED',
        bookableOnline: dto.bookableOnline ?? true,
        bio: dto.bio ?? null,
        baseSalary: dto.baseSalary !== undefined ? toMoney(dto.baseSalary) : null,
        salons: { create: dto.salonIds.map((salonId) => ({ salonId })) },
      },
      select: { id: true },
    });
    for (const salonId of dto.salonIds) await this.defaults.ensureStaffSchedule(staff.id, salonId);
    if (dto.serviceIds?.length) await this.setSkills(user, staff.id, { skills: dto.serviceIds.map((serviceId) => ({ serviceId })) });
    await this.audit.log({ action: 'staff.create', entityType: 'staff', entityId: staff.id, after: { displayName: dto.displayName } });
    return this.detail(user, staff.id);
  }

  async update(user: AuthUser, staffId: string, dto: UpdateStaffDto) {
    const staff = await this.get(user, staffId);
    this.assertManageable(user, staff.salons.map((s) => s.salonId));
    if (dto.isActive === false && staff.membership?.roles.some((r) => r.role.code === 'OWNER')) {
      throw new BadRequestException('Le profil du propriétaire ne peut pas être désactivé.');
    }
    if (dto.isActive === true && !staff.isActive) await this.assertQuota();

    await this.db.tx.staffMember.update({
      where: { id: staffId },
      data: {
        displayName: dto.displayName,
        phone: dto.phone,
        contractType: dto.contractType,
        calendarColor: dto.calendarColor,
        bookableOnline: dto.bookableOnline,
        bio: dto.bio,
        baseSalary: dto.baseSalary !== undefined ? toMoney(dto.baseSalary) : undefined,
        isActive: dto.isActive,
      },
    });
    if (dto.salonIds) await this.setSalons(user, staffId, dto.salonIds);
    if (dto.serviceIds) await this.setSkills(user, staffId, { skills: dto.serviceIds.map((serviceId) => ({ serviceId })) });
    await this.audit.log({ action: 'staff.update', entityType: 'staff', entityId: staffId, after: JSON.parse(JSON.stringify(dto)) });
    return this.detail(user, staffId);
  }

  async setSalons(user: AuthUser, staffId: string, salonIds: string[]) {
    if (salonIds.length === 0) throw new BadRequestException('Un employé travaille dans au moins un salon.');
    const staff = await this.get(user, staffId);
    const current = staff.salons.map((s) => s.salonId);
    // Ajouts et retraits ne concernent que des salons du périmètre de l'auteur.
    const changed = [...salonIds.filter((id) => !current.includes(id)), ...current.filter((id) => !salonIds.includes(id))];
    this.assertSalonsInScope(user, changed);
    await this.assertSalonsExist(salonIds);
    await this.db.tx.staffSalon.deleteMany({ where: { staffId, salonId: { notIn: salonIds } } });
    await this.db.tx.staffSalon.createMany({
      data: salonIds.map((salonId) => ({ tenantId: this.db.tenantId!, staffId, salonId })),
      skipDuplicates: true,
    });
    for (const salonId of salonIds) await this.defaults.ensureStaffSchedule(staffId, salonId);
  }

  async setSkills(user: AuthUser, staffId: string, dto: StaffSkillsDto) {
    const staff = await this.get(user, staffId);
    this.assertManageable(user, staff.salons.map((s) => s.salonId));
    const serviceIds = [...new Set(dto.skills.map((s) => s.serviceId))];
    const found = await this.db.tx.service.count({ where: { id: { in: serviceIds }, deletedAt: null } });
    if (found !== serviceIds.length) throw new BadRequestException('Prestation inconnue.');
    const hasPriceOverride = dto.skills.some((s) => s.priceOverride !== undefined && s.priceOverride !== null);
    if (hasPriceOverride && !user.permissions.includes('prices.manage')) {
      throw new ForbiddenException('Définir un tarif propre à un employé nécessite la permission « Modifier les prix ».');
    }
    await this.db.tx.staffSkill.deleteMany({ where: { staffId } });
    if (dto.skills.length) {
      await this.db.tx.staffSkill.createMany({
        data: dto.skills.map((s) => ({
          tenantId: this.db.tenantId!,
          staffId,
          serviceId: s.serviceId,
          priceOverride: s.priceOverride !== undefined && s.priceOverride !== null ? toMoney(s.priceOverride) : null,
          durationFactor: s.durationFactor ?? 100,
        })),
      });
    }
    return this.detail(user, staffId);
  }

  /** Remplace le planning hebdomadaire d'un employé dans un salon. */
  async setSchedule(user: AuthUser, staffId: string, dto: ScheduleDto) {
    const staff = await this.get(user, staffId);
    this.assertSalonsInScope(user, [dto.salonId]);
    if (!staff.salons.some((s) => s.salonId === dto.salonId)) {
      throw new BadRequestException("Cet employé n'est pas rattaché à ce salon.");
    }
    const byDay = new Map<number, ScheduleDto['entries']>();
    for (const entry of dto.entries) {
      if (entry.endsAt <= entry.startsAt) throw new BadRequestException("L'heure de fin doit suivre l'heure de début.");
      const day = byDay.get(entry.weekday) ?? [];
      if (day.some((o) => entry.startsAt < o.endsAt && o.startsAt < entry.endsAt)) {
        throw new BadRequestException('Deux plages du planning se chevauchent le même jour.');
      }
      day.push(entry);
      byDay.set(entry.weekday, day);
    }
    await this.db.tx.staffSchedule.deleteMany({ where: { staffId, salonId: dto.salonId } });
    if (dto.entries.length) {
      await this.db.tx.staffSchedule.createMany({
        data: dto.entries.map((e) => ({ tenantId: this.db.tenantId!, staffId, salonId: dto.salonId, ...e })),
      });
    }
    await this.audit.log({ action: 'staff.schedule', entityType: 'staff', entityId: staffId, salonId: dto.salonId });
    return this.detail(user, staffId);
  }

  async listTimeOff(user: AuthUser, staffId: string, from?: string, to?: string) {
    await this.get(user, staffId);
    return this.db.tx.staffTimeOff.findMany({
      where: {
        staffId,
        ...(to ? { startsAt: { lt: new Date(to) } } : {}),
        ...(from ? { endsAt: { gt: new Date(from) } } : {}),
      },
      select: { id: true, type: true, startsAt: true, endsAt: true, note: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  async addTimeOff(user: AuthUser, staffId: string, dto: TimeOffDto) {
    const staff = await this.get(user, staffId);
    this.assertManageable(user, staff.salons.map((s) => s.salonId));
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('La fin doit suivre le début.');
    const conflicts = await this.db.tx.appointmentItem.count({
      where: {
        staffId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        appointment: { status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] } },
      },
    });
    const timeOff = await this.db.tx.staffTimeOff.create({
      data: { tenantId: this.db.tenantId!, staffId, type: dto.type, startsAt, endsAt, note: dto.note ?? null, createdBy: user.userId },
      select: { id: true, type: true, startsAt: true, endsAt: true, note: true },
    });
    await this.audit.log({ action: 'staff.time_off', entityType: 'staff', entityId: staffId, after: { type: dto.type, startsAt: dto.startsAt, endsAt: dto.endsAt } });
    // L'absence est enregistrée ; les rendez-vous déjà pris sur la période sont signalés.
    return { ...timeOff, conflictingAppointments: conflicts };
  }

  async removeTimeOff(user: AuthUser, staffId: string, timeOffId: string) {
    const staff = await this.get(user, staffId);
    this.assertManageable(user, staff.salons.map((s) => s.salonId));
    const deleted = await this.db.tx.staffTimeOff.deleteMany({ where: { id: timeOffId, staffId } });
    if (deleted.count === 0) throw new NotFoundException('Absence introuvable.');
  }

  // ------------------------------------------------------------------ Commissions

  listCommissionRules() {
    return this.db.tx.commissionRule.findMany({
      where: { OR: [{ validTo: null }, { validTo: { gte: new Date() } }] },
      select: {
        id: true,
        appliesTo: true,
        type: true,
        value: true,
        staff: { select: { id: true, displayName: true } },
        serviceCategory: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createCommissionRule(dto: CommissionRuleDto) {
    if (dto.type === 'PERCENT' && dto.value > 100) throw new BadRequestException('Un pourcentage ne peut pas dépasser 100.');
    if (dto.appliesTo === 'PRODUCT' && (dto.serviceId || dto.serviceCategoryId)) {
      throw new BadRequestException('Une règle « produits » ne peut pas viser une prestation.');
    }
    if (dto.appliesTo === 'SERVICE' && dto.productId) throw new BadRequestException('Une règle « prestations » ne peut pas viser un produit.');
    const rule = await this.db.tx.commissionRule.create({
      data: {
        tenantId: this.db.tenantId!,
        staffId: dto.staffId ?? null,
        serviceCategoryId: dto.serviceCategoryId ?? null,
        serviceId: dto.serviceId ?? null,
        productId: dto.productId ?? null,
        appliesTo: dto.appliesTo,
        type: dto.type,
        value: dto.value,
      },
      select: { id: true },
    });
    await this.audit.log({ action: 'commission.rule_create', entityType: 'commission_rule', entityId: rule.id, after: JSON.parse(JSON.stringify(dto)) });
    return rule;
  }

  /** Une règle n'est jamais supprimée (les commissions passées y font référence) : elle est close. */
  async closeCommissionRule(ruleId: string) {
    const updated = await this.db.tx.commissionRule.updateMany({ where: { id: ruleId, validTo: null }, data: { validTo: new Date() } });
    if (updated.count === 0) throw new NotFoundException('Règle introuvable.');
    await this.audit.log({ action: 'commission.rule_close', entityType: 'commission_rule', entityId: ruleId });
  }

  // ------------------------------------------------------------------ Outils

  private present(staff: {
    id: string;
    displayName: string;
    phone: string | null;
    photoKey: string | null;
    bio: string | null;
    calendarColor: string;
    contractType: string;
    baseSalary: bigint | null;
    bookableOnline: boolean;
    isActive: boolean;
    membershipId: string | null;
    membership: { status: string; user: { fullName: string; phone: string }; roles: { role: { code: string; name: string } }[] } | null;
    salons: { salonId: string }[];
    skills: { serviceId: string; priceOverride: bigint | null; durationFactor: number }[];
  }) {
    return {
      id: staff.id,
      displayName: staff.displayName,
      phone: staff.phone ?? staff.membership?.user.phone ?? null,
      bio: staff.bio,
      calendarColor: staff.calendarColor,
      contractType: staff.contractType,
      baseSalary: staff.baseSalary,
      bookableOnline: staff.bookableOnline,
      isActive: staff.isActive,
      hasAccount: staff.membershipId !== null,
      membershipId: staff.membershipId,
      membershipStatus: staff.membership?.status ?? null,
      roles: staff.membership?.roles.map((r) => r.role) ?? [],
      salonIds: staff.salons.map((s) => s.salonId),
      skills: staff.skills,
    };
  }

  private isVisible(user: AuthUser, salonIds: string[]): boolean {
    return user.allSalons || salonIds.some((id) => canAccessSalon(user, id));
  }

  /** Un membre limité ne gère que les employés entièrement dans son périmètre. */
  private assertManageable(user: AuthUser, salonIds: string[]) {
    if (!user.allSalons && !salonIds.every((id) => canAccessSalon(user, id))) {
      throw new ForbiddenException('Cet employé travaille aussi dans un salon hors de votre périmètre.');
    }
  }

  private assertSalonsInScope(user: AuthUser, salonIds: string[]) {
    if (!salonIds.every((id) => canAccessSalon(user, id))) {
      throw new ForbiddenException('Salon hors de votre périmètre.');
    }
  }

  private async assertSalonsExist(salonIds: string[]) {
    if (salonIds.length === 0) throw new BadRequestException('Choisissez au moins un salon.');
    const found = await this.db.tx.salon.count({ where: { id: { in: salonIds }, deletedAt: null } });
    if (found !== new Set(salonIds).size) throw new BadRequestException('Salon inconnu.');
  }

  private async assertQuota() {
    const tenant = await this.db.tx.tenant.findUniqueOrThrow({ where: { id: this.db.tenantId! }, select: { plan: { select: { maxStaff: true } } } });
    if (tenant.plan.maxStaff === null) return;
    const active = await this.db.tx.staffMember.count({ where: { isActive: true } });
    if (active >= tenant.plan.maxStaff) {
      throw new ForbiddenException(`Votre offre est limitée à ${tenant.plan.maxStaff} employés actifs.`);
    }
  }
}
