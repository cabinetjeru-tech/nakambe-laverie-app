import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FilePurpose, MerchantMemberRole, MerchantStatus, Prisma, SecretKind, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../../audit/audit.service';
import { assertCityAccess, AuthUser, cityFilter } from '../../common/auth-user';
import { paginate } from '../../common/dto/pagination.dto';
import { PERMISSIONS, ROLE } from '../../common/permissions';
import { haversineKm } from '../../common/utils/geo';
import { normalizeBurkinaPhone } from '../../common/utils/phone';
import { generateTemporaryPin } from '../../common/utils/secret-policy';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSecretPolicy, BCRYPT_COST, requirePhone } from '../auth/auth.service';
import { GeoService } from '../geo/geo.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import {
  AddMemberDto,
  AdminCreateMerchantDto,
  AdminMerchantQueryDto,
  AdminUpdateMerchantDto,
  BusinessDto,
  ClosureDto,
  MerchantQueryDto,
  PartnerSignupDto,
  UpdateMerchantProfileDto,
} from './dto/merchants.dto';
import { hoursValidationError, isOpenAt, OpeningSlot } from './opening-hours';

const merchantWithOpening = {
  openingHours: { orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }] },
  closures: { where: { endsAt: { gt: new Date(0) } }, orderBy: { startsAt: 'asc' } },
  city: { select: { id: true, name: true, timezone: true } },
} satisfies Prisma.MerchantInclude;

type MerchantWithOpening = Prisma.MerchantGetPayload<{ include: typeof merchantWithOpening }>;

/** Droits des membres d'un commerce : l'équipe (STAFF) traite les commandes, les responsables gèrent tout. */
const MANAGE_ROLES: MerchantMemberRole[] = [MerchantMemberRole.OWNER, MerchantMemberRole.MANAGER];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'commerce';
}

@Injectable()
export class MerchantsService {
  constructor(
    private prisma: PrismaService,
    private geo: GeoService,
    private storage: StorageService,
    private settings: SettingsService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  isOpen(m: MerchantWithOpening, at = new Date()) {
    const closures = m.closures.filter((c) => c.endsAt > at);
    return isOpenAt({ status: m.status, isOpenOverride: m.isOpenOverride, hours: m.openingHours, closures }, at, m.city.timezone);
  }

  async commissionPercent(merchant: { commissionPercent: number | null }) {
    return merchant.commissionPercent ?? (await this.settings.get('merchants.defaultCommissionPercent'));
  }

  // ------------------------------------------------------------------ public (clients)

  async listPublic(query: MerchantQueryDto) {
    const search = query.search?.trim();
    const merchants = await this.prisma.merchant.findMany({
      where: {
        status: MerchantStatus.ACTIVE,
        cityId: query.cityId,
        type: query.type,
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { products: { some: { name: { contains: search, mode: 'insensitive' }, isAvailable: true } } }] } : {}),
      },
      include: merchantWithOpening,
      take: 200,
    });
    const at = new Date();
    return merchants
      .map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        type: m.type,
        description: m.description,
        logoUrl: m.logoUrl,
        coverUrl: m.coverUrl,
        landmark: m.landmark,
        city: { id: m.city.id, name: m.city.name },
        avgPrepMinutes: m.avgPrepMinutes,
        minOrderAmount: m.minOrderAmount,
        rating: m.ratingCount ? Math.round(m.ratingAvg * 10) / 10 : null,
        ratingCount: m.ratingCount,
        isOpen: this.isOpen(m, at),
        distanceKm: query.lat != null && query.lng != null ? Math.round(haversineKm({ lat: query.lat, lng: query.lng }, m) * 10) / 10 : null,
      }))
      .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.name.localeCompare(b.name));
  }

  async getPublic(slugOrId: string) {
    const merchant = await this.prisma.merchant.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: /^[0-9a-f-]{36}$/.test(slugOrId) ? slugOrId : undefined }], status: MerchantStatus.ACTIVE },
      include: {
        ...merchantWithOpening,
        categories: { orderBy: [{ position: 'asc' }, { name: 'asc' }] },
        products: {
          where: { isAvailable: true },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          include: { optionGroups: { include: { options: true } } },
        },
      },
    });
    if (!merchant) throw new NotFoundException('Commerce introuvable ou fermé définitivement.');
    return {
      id: merchant.id,
      slug: merchant.slug,
      name: merchant.name,
      type: merchant.type,
      description: merchant.description,
      logoUrl: merchant.logoUrl,
      coverUrl: merchant.coverUrl,
      phone: merchant.phone,
      lat: merchant.lat,
      lng: merchant.lng,
      landmark: merchant.landmark,
      addressText: merchant.addressText,
      city: { id: merchant.city.id, name: merchant.city.name },
      avgPrepMinutes: merchant.avgPrepMinutes,
      minOrderAmount: merchant.minOrderAmount,
      rating: merchant.ratingCount ? Math.round(merchant.ratingAvg * 10) / 10 : null,
      ratingCount: merchant.ratingCount,
      isOpen: this.isOpen(merchant),
      openingHours: merchant.openingHours.map((h) => ({ weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt })),
      categories: merchant.categories.map((c) => ({ id: c.id, name: c.name })),
      products: merchant.products.map((p) => ({
        id: p.id,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        price: p.price,
        imageUrl: p.imageUrl,
        optionGroups: p.optionGroups.map((g) => ({
          id: g.id,
          name: g.name,
          minChoices: g.minChoices,
          maxChoices: g.maxChoices,
          options: g.options.map((o) => ({ id: o.id, name: o.name, extraPrice: o.extraPrice })),
        })),
      })),
    };
  }

  // ------------------------------------------------------------------ inscription des commerces

  private async uniqueSlug(name: string) {
    const base = slugify(name);
    for (let i = 0; i < 20; i++) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      if (!(await this.prisma.merchant.findUnique({ where: { slug } }))) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  private async businessData(b: BusinessDto) {
    const phone = requirePhone(b.phone);
    const city = await this.prisma.city.findFirst({ where: { id: b.cityId, isActive: true } });
    if (!city) throw new BadRequestException('Cette ville n’est pas desservie.');
    const location = await this.geo.locate(b);
    if (!location || location.city.id !== city.id) throw new BadRequestException(`Placez le commerce dans la zone desservie de ${city.name}.`);
    return {
      name: b.name.trim(),
      slug: await this.uniqueSlug(b.name),
      type: b.type,
      phone,
      cityId: city.id,
      zoneId: location.zone?.id ?? null,
      lat: b.lat,
      lng: b.lng,
      addressText: b.addressText,
      landmark: b.landmark,
      description: b.description,
    };
  }

  private async ensureMerchantRole(tx: Prisma.TransactionClient, userId: string) {
    const role = await tx.role.findUniqueOrThrow({ where: { code: ROLE.MERCHANT } });
    const has = await tx.userRole.findFirst({ where: { userId, roleId: role.id } });
    if (!has) await tx.userRole.create({ data: { userId, roleId: role.id } });
  }

  private async announceNewPartner(name: string, cityId: string) {
    await this.notifications.notifyStaff(
      PERMISSIONS.MERCHANTS_MANAGE.code,
      { type: 'ADMIN_ALERT', title: 'Nouveau partenaire à valider', body: `${name} demande à rejoindre Allô-Coursier.`, url: '/admin/commercants?status=PENDING' },
      cityId,
    );
  }

  /** Inscription publique : crée le compte du responsable (rôle commerçant) et le commerce en attente de validation. */
  async signup(dto: PartnerSignupDto) {
    const ownerPhone = requirePhone(dto.owner.phone);
    assertSecretPolicy(SecretKind.PIN, dto.owner.pin);
    if (await this.prisma.user.findUnique({ where: { phone: ownerPhone } })) {
      throw new ConflictException('Un compte existe déjà avec ce numéro : connectez-vous puis faites la demande depuis « Devenir partenaire ».');
    }
    const data = await this.businessData(dto.business);
    const secretHash = await bcrypt.hash(dto.owner.pin, BCRYPT_COST);
    const merchant = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { phone: ownerPhone, firstName: dto.owner.firstName.trim(), lastName: dto.owner.lastName.trim(), secretHash, secretKind: SecretKind.PIN },
      });
      await this.ensureMerchantRole(tx, user.id);
      return tx.merchant.create({ data: { ...data, members: { create: { userId: user.id, role: MerchantMemberRole.OWNER } } } });
    });
    await this.announceNewPartner(merchant.name, merchant.cityId);
    return { merchantId: merchant.id, status: merchant.status, message: 'Demande envoyée : connectez-vous avec votre numéro et votre code secret.' };
  }

  /** Demande d'un utilisateur déjà connecté (ex. un client qui ouvre son commerce). */
  async apply(userId: string, business: BusinessDto) {
    const data = await this.businessData(business);
    const merchant = await this.prisma.$transaction(async (tx) => {
      await this.ensureMerchantRole(tx, userId);
      return tx.merchant.create({ data: { ...data, members: { create: { userId, role: MerchantMemberRole.OWNER } } } });
    });
    await this.announceNewPartner(merchant.name, merchant.cityId);
    return { merchantId: merchant.id, status: merchant.status, message: 'Demande envoyée. Reconnectez-vous pour accéder à l’espace commerçant.' };
  }

  // ------------------------------------------------------------------ espace commerçant

  async memberships(userId: string) {
    const members = await this.prisma.merchantMember.findMany({
      where: { userId },
      include: { merchant: { select: { id: true, name: true, slug: true, status: true, logoUrl: true, type: true } } },
    });
    return members.map((m) => ({ role: m.role, ...m.merchant }));
  }

  /** Vérifie l'appartenance au commerce (et le niveau requis). */
  async assertMember(userId: string, merchantId: string, manage = false) {
    const member = await this.prisma.merchantMember.findUnique({ where: { merchantId_userId: { merchantId, userId } } });
    if (!member) throw new NotFoundException('Commerce introuvable.');
    if (manage && !MANAGE_ROLES.includes(member.role)) throw new ForbiddenException('Réservé au responsable du commerce.');
    return member;
  }

  async mine(userId: string, merchantId: string) {
    const member = await this.assertMember(userId, merchantId);
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { ...merchantWithOpening, members: { include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } } } },
    });
    return {
      ...merchant,
      myRole: member.role,
      isOpen: this.isOpen(merchant),
      commissionPercent: await this.commissionPercent(merchant),
      closures: merchant.closures.filter((c) => c.endsAt > new Date()),
    };
  }

  private async mediaUrl(userId: string, key?: string | null) {
    if (key === undefined) return undefined;
    if (key === null || key === '') return null;
    await this.storage.assertOwned(key, userId, [FilePurpose.MERCHANT_MEDIA]);
    return this.storage.publicUrl(key);
  }

  async updateProfile(userId: string, merchantId: string, dto: UpdateMerchantProfileDto) {
    await this.assertMember(userId, merchantId, true);
    const { logoKey, coverKey, phone, lat, lng, ...rest } = dto;
    const data: Prisma.MerchantUpdateInput = { ...rest, logoUrl: await this.mediaUrl(userId, logoKey), coverUrl: await this.mediaUrl(userId, coverKey) };
    if (phone) data.phone = requirePhone(phone);
    if (lat != null && lng != null) {
      const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
      const location = await this.geo.locate({ lat, lng });
      if (!location || location.city.id !== merchant.cityId) throw new BadRequestException('Position hors de la ville du commerce.');
      Object.assign(data, { lat, lng, zone: location.zone ? { connect: { id: location.zone.id } } : { disconnect: true } });
    }
    await this.prisma.merchant.update({ where: { id: merchantId }, data });
    return this.mine(userId, merchantId);
  }

  async setHours(userId: string, merchantId: string, hours: OpeningSlot[]) {
    await this.assertMember(userId, merchantId, true);
    const error = hoursValidationError(hours);
    if (error) throw new BadRequestException(error);
    await this.prisma.$transaction([
      this.prisma.merchantOpeningHour.deleteMany({ where: { merchantId } }),
      this.prisma.merchantOpeningHour.createMany({ data: hours.map((h) => ({ ...h, merchantId })) }),
    ]);
    return this.mine(userId, merchantId);
  }

  async setOpenOverride(userId: string, merchantId: string, value: boolean | null) {
    await this.assertMember(userId, merchantId);
    await this.prisma.merchant.update({ where: { id: merchantId }, data: { isOpenOverride: value } });
    return this.mine(userId, merchantId);
  }

  async addClosure(userId: string, merchantId: string, dto: ClosureDto) {
    await this.assertMember(userId, merchantId, true);
    if (dto.endsAt <= dto.startsAt) throw new BadRequestException('La fin doit être après le début.');
    await this.prisma.merchantClosure.create({ data: { merchantId, ...dto } });
    return this.mine(userId, merchantId);
  }

  async deleteClosure(userId: string, merchantId: string, closureId: string) {
    await this.assertMember(userId, merchantId, true);
    await this.prisma.merchantClosure.deleteMany({ where: { id: closureId, merchantId } });
    return this.mine(userId, merchantId);
  }

  async addMember(userId: string, merchantId: string, dto: AddMemberDto) {
    const me = await this.assertMember(userId, merchantId, true);
    if (dto.role === MerchantMemberRole.OWNER && me.role !== MerchantMemberRole.OWNER) throw new ForbiddenException('Seul le propriétaire peut nommer un propriétaire.');
    const phone = requirePhone(dto.phone);
    let temporaryPin: string | undefined;
    const target = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { phone } });
      if (!user) {
        if (!dto.firstName || !dto.lastName) throw new BadRequestException('Indiquez le prénom et le nom de cette personne.');
        temporaryPin = generateTemporaryPin();
        user = await tx.user.create({
          data: { phone, firstName: dto.firstName, lastName: dto.lastName, secretKind: SecretKind.PIN, secretHash: await bcrypt.hash(temporaryPin, BCRYPT_COST) },
        });
      }
      if (user.status !== UserStatus.ACTIVE) throw new BadRequestException('Ce compte est suspendu.');
      await this.ensureMerchantRole(tx, user.id);
      await tx.merchantMember.upsert({
        where: { merchantId_userId: { merchantId, userId: user.id } },
        create: { merchantId, userId: user.id, role: dto.role },
        update: { role: dto.role },
      });
      return user;
    });
    return { userId: target.id, temporaryPin };
  }

  async removeMember(userId: string, merchantId: string, memberUserId: string) {
    await this.assertMember(userId, merchantId, true);
    if (memberUserId === userId) throw new BadRequestException('Vous ne pouvez pas vous retirer vous-même.');
    const target = await this.prisma.merchantMember.findUnique({ where: { merchantId_userId: { merchantId, userId: memberUserId } } });
    if (target?.role === MerchantMemberRole.OWNER) throw new ForbiddenException('Le propriétaire ne peut pas être retiré.');
    await this.prisma.merchantMember.deleteMany({ where: { merchantId, userId: memberUserId } });
    return { success: true };
  }

  // ------------------------------------------------------------------ administration

  async adminList(query: AdminMerchantQueryDto, user: AuthUser) {
    const search = query.search?.trim();
    const where: Prisma.MerchantWhereInput = {
      status: query.status,
      cityId: cityFilter(user, query.cityId),
      ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search.replace(/\D/g, '') || search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.merchant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(query),
        include: { city: { select: { name: true } }, _count: { select: { orders: true, products: true } } },
      }),
      this.prisma.merchant.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async adminGet(id: string, user: AuthUser) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        ...merchantWithOpening,
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } } },
        wallets: true,
        _count: { select: { orders: true, products: true } },
      },
    });
    if (!merchant) throw new NotFoundException('Commerce introuvable.');
    assertCityAccess(user, merchant.cityId);
    return { ...merchant, isOpen: this.isOpen(merchant), effectiveCommissionPercent: await this.commissionPercent(merchant) };
  }

  async adminCreate(dto: AdminCreateMerchantDto, actor: AuthUser) {
    assertCityAccess(actor, dto.business.cityId);
    const ownerPhone = normalizeBurkinaPhone(dto.ownerPhone);
    if (!ownerPhone) throw new BadRequestException('Téléphone du responsable invalide.');
    const data = await this.businessData(dto.business);
    let temporaryPin: string | undefined;
    const merchant = await this.prisma.$transaction(async (tx) => {
      let owner = await tx.user.findUnique({ where: { phone: ownerPhone } });
      if (!owner) {
        if (!dto.ownerFirstName || !dto.ownerLastName) throw new BadRequestException('Indiquez le prénom et le nom du responsable.');
        temporaryPin = generateTemporaryPin();
        owner = await tx.user.create({
          data: { phone: ownerPhone, firstName: dto.ownerFirstName, lastName: dto.ownerLastName, secretKind: SecretKind.PIN, secretHash: await bcrypt.hash(temporaryPin, BCRYPT_COST) },
        });
      }
      await this.ensureMerchantRole(tx, owner.id);
      return tx.merchant.create({
        data: { ...data, status: MerchantStatus.ACTIVE, members: { create: { userId: owner.id, role: MerchantMemberRole.OWNER } } },
      });
    });
    await this.audit.log({ actorId: actor.id, action: 'merchant.create', entityType: 'Merchant', entityId: merchant.id, after: merchant });
    return { merchant, temporaryPin };
  }

  async adminUpdate(id: string, dto: AdminUpdateMerchantDto, actor: AuthUser) {
    const before = await this.adminGet(id, actor);
    if (dto.cityId) assertCityAccess(actor, dto.cityId);
    const merchant = await this.prisma.merchant.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: actor.id, action: 'merchant.update', entityType: 'Merchant', entityId: id, before: { status: before.status, commissionPercent: before.commissionPercent }, after: dto });
    if (dto.status && dto.status !== before.status) {
      const owners = before.members.filter((m) => MANAGE_ROLES.includes(m.role)).map((m) => m.userId);
      await this.notifications.notify(owners, {
        type: 'MERCHANT',
        title: dto.status === 'ACTIVE' ? 'Votre commerce est en ligne 🎉' : 'Commerce suspendu',
        body: dto.status === 'ACTIVE' ? `${merchant.name} est visible par les clients d’Allô-Coursier. Ajoutez votre menu et vos horaires.` : 'Contactez l’équipe Allô-Coursier.',
        url: '/commercant',
      });
    }
    return this.adminGet(id, actor);
  }
}
