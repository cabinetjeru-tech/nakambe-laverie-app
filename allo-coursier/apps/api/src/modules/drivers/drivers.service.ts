import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DriverStatus, Prisma, SecretKind } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../../audit/audit.service';
import { paginate } from '../../common/dto/pagination.dto';
import { ROLE } from '../../common/permissions';
import { generateTemporaryPin } from '../../common/utils/secret-policy';
import { PrismaService } from '../../prisma/prisma.service';
import { BCRYPT_COST, requirePhone } from '../auth/auth.service';
import { CreateDriverDto, DriverQueryDto, UpdateDriverDto } from './dto/drivers.dto';

const driverInclude = {
  user: { select: { id: true, phone: true, firstName: true, lastName: true, avatarUrl: true, status: true, createdAt: true } },
  city: { select: { id: true, name: true } },
} satisfies Prisma.DriverProfileInclude;

@Injectable()
export class DriversService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  async list(query: DriverQueryDto) {
    const search = query.search?.trim();
    const digits = search?.replace(/\D/g, '');
    const where: Prisma.DriverProfileWhereInput = {
      status: query.status,
      cityId: query.cityId,
      employmentType: query.employmentType,
      user: search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              ...(digits && digits.length >= 2 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.driverProfile.findMany({ where, include: driverInclude, orderBy: { createdAt: 'desc' }, ...paginate(query) }),
      this.prisma.driverProfile.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId },
      include: { ...driverInclude, documents: { orderBy: { createdAt: 'desc' } } },
    });
    if (!driver) throw new NotFoundException('Livreur introuvable.');
    const wallet = await this.prisma.wallet.findUnique({ where: { kind_userId: { kind: 'DRIVER', userId } } });
    return {
      ...driver,
      documents: driver.documents.map((d) => ({ ...d, url: this.storage.signedUrl(d.fileKey) })),
      walletId: wallet?.id ?? null,
      walletBalance: wallet?.balance ?? 0,
    };
  }

  async reviewDocument(driverId: string, documentId: string, approve: boolean, reason: string | undefined, actorId: string) {
    const doc = await this.prisma.driverDocument.findFirst({ where: { id: documentId, driverId } });
    if (!doc) throw new NotFoundException('Document introuvable.');
    if (!approve && !reason) throw new BadRequestException('Indiquez le motif du refus.');
    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: {
        status: approve ? DocumentStatus.APPROVED : DocumentStatus.REJECTED,
        rejectionReason: approve ? null : reason,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });
    await this.audit.log({ actorId, action: approve ? 'driver_document.approve' : 'driver_document.reject', entityType: 'DriverDocument', entityId: documentId, after: { reason } });
    if (!approve) {
      await this.notifications.notify(driverId, {
        type: 'DRIVER',
        title: 'Document refusé',
        body: `${reason} — envoyez une nouvelle photo depuis votre profil.`,
        url: '/livreur/profil',
      });
    }
    return updated;
  }

  async approve(userId: string, actorId: string) {
    const before = await this.get(userId);
    if (before.status === DriverStatus.APPROVED) return before;
    const driver = await this.prisma.driverProfile.update({
      where: { userId },
      data: { status: DriverStatus.APPROVED, approvedById: actorId, approvedAt: new Date(), rejectionReason: null },
      include: driverInclude,
    });
    await this.audit.log({ actorId, action: 'driver.approve', entityType: 'DriverProfile', entityId: userId, before: { status: before.status }, after: { status: driver.status } });
    await this.notifications.notify(userId, {
      type: 'DRIVER',
      title: 'Bienvenue chez Allô-Coursier 🎉',
      body: 'Votre compte livreur est validé. Passez « En ligne » pour recevoir des missions.',
      url: '/livreur',
    });
    return driver;
  }

  async reject(userId: string, reason: string, actorId: string) {
    const before = await this.get(userId);
    if (before.status !== DriverStatus.PENDING) {
      throw new BadRequestException('Seule une inscription en attente peut être refusée ; sinon, suspendez le livreur.');
    }
    const driver = await this.prisma.driverProfile.update({
      where: { userId },
      data: { status: DriverStatus.REJECTED, rejectionReason: reason, isOnline: false },
      include: driverInclude,
    });
    await this.audit.log({ actorId, action: 'driver.reject', entityType: 'DriverProfile', entityId: userId, before: { status: before.status }, after: { status: driver.status, reason } });
    await this.notifications.notify(userId, { type: 'DRIVER', title: 'Inscription non retenue', body: reason, url: '/livreur' });
    return driver;
  }

  async update(userId: string, dto: UpdateDriverDto, actorId: string) {
    const before = await this.get(userId);
    if (dto.status === DriverStatus.APPROVED && before.status !== DriverStatus.SUSPENDED && before.status !== DriverStatus.APPROVED) {
      throw new BadRequestException("Utilisez « Valider l'inscription » pour un livreur en attente.");
    }
    if (dto.cityId && !(await this.prisma.city.findUnique({ where: { id: dto.cityId } }))) {
      throw new BadRequestException('Ville introuvable.');
    }
    const driver = await this.prisma.driverProfile.update({
      where: { userId },
      data: {
        ...dto,
        plateNumber: dto.plateNumber?.trim().toUpperCase(),
        // Un livreur suspendu est immédiatement mis hors ligne.
        isOnline: dto.status === DriverStatus.SUSPENDED ? false : undefined,
      },
      include: driverInclude,
    });
    await this.audit.log({ actorId, action: 'driver.update', entityType: 'DriverProfile', entityId: userId, before, after: driver });
    return driver;
  }

  /** Création directe par l'administration (typiquement les salariés) ; le livreur est validé d'office. */
  async create(dto: CreateDriverDto, actorId: string) {
    const phone = requirePhone(dto.phone);
    if (await this.prisma.user.findUnique({ where: { phone } })) {
      throw new ConflictException('Un compte existe déjà avec ce numéro.');
    }
    if (!(await this.prisma.city.findUnique({ where: { id: dto.cityId } }))) {
      throw new BadRequestException('Ville introuvable.');
    }
    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: ROLE.DRIVER } });
    const temporaryPin = generateTemporaryPin();
    const user = await this.prisma.user.create({
      data: {
        phone,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        secretKind: SecretKind.PIN,
        secretHash: await bcrypt.hash(temporaryPin, BCRYPT_COST),
        roles: { create: { roleId: role.id } },
        driverProfile: {
          create: {
            cityId: dto.cityId,
            vehicleType: dto.vehicleType,
            employmentType: dto.employmentType,
            plateNumber: dto.plateNumber?.trim().toUpperCase(),
            status: DriverStatus.APPROVED,
            approvedById: actorId,
            approvedAt: new Date(),
          },
        },
      },
    });
    await this.audit.log({ actorId, action: 'driver.create', entityType: 'DriverProfile', entityId: user.id, after: { ...dto, phone } });
    return { driver: await this.get(user.id), temporaryPin };
  }
}
