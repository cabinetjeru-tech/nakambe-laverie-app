import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { canAccessSalon } from '../../core/permissions/salon-scope';
import { SequenceService } from '../../core/tenant/sequence.service';
import { TenantCryptoService } from '../../core/tenant/tenant-crypto.service';
import { ClientQueryDto, ConsentDto, CreateClientDto, NoteDto, TechnicalNoteDto, UpdateClientDto } from './dto/client.dto';

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] as const;

/**
 * Fichier clients (CRM). Trois niveaux de lecture :
 * - clients.read.basic : nom, numéro, téléphone (prise de rendez-vous, caisse) ;
 * - clients.read       : fiche complète, historique, statistiques ;
 * - clients.technical.read : fiche technique chiffrée (formules, allergies).
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly db: DbService,
    private readonly sequences: SequenceService,
    private readonly tenantCrypto: TenantCryptoService,
    private readonly audit: AuditService,
  ) {}

  async search(user: AuthUser, query: ClientQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const q = query.q?.trim();
    const digits = q?.replace(/\D/g, '') ?? '';
    const where: Prisma.ClientProfileWhereInput = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { clientNumber: { contains: q, mode: 'insensitive' } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : {}),
    };
    const full = user.permissions.includes('clients.read');
    const [total, rows] = await Promise.all([
      this.db.tx.clientProfile.count({ where }),
      this.db.tx.clientProfile.findMany({
        where,
        select: {
          id: true,
          clientNumber: true,
          fullName: true,
          phone: true,
          isBlocked: true,
          ...(full ? { tags: true, lastVisitAt: true, visitCount: true, totalSpent: true, noShowCount: true } : {}),
        },
        orderBy: q ? { fullName: 'asc' } : { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items: rows };
  }

  async create(user: AuthUser, dto: CreateClientDto) {
    await this.assertReferences(user, dto);
    const client = await this.db.tx.clientProfile.create({
      data: {
        tenantId: this.db.tenantId!,
        clientNumber: await this.sequences.next('CLIENT'),
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        whatsapp: dto.whatsapp ?? dto.phone ?? null,
        email: dto.email ?? null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        gender: dto.gender ?? null,
        hairType: dto.hairType ?? null,
        tags: dto.tags ?? [],
        source: dto.source ?? null,
        preferredSalonId: dto.preferredSalonId ?? null,
        preferredStaffId: dto.preferredStaffId ?? null,
        createdBy: user.userId,
      },
      select: { id: true },
    }).catch((error) => this.rethrowDuplicatePhone(error));
    if (dto.marketingConsent !== undefined) {
      await this.recordConsent(user, client.id, { type: 'MARKETING_WHATSAPP', granted: dto.marketingConsent }, 'comptoir');
      await this.recordConsent(user, client.id, { type: 'MARKETING_SMS', granted: dto.marketingConsent }, 'comptoir');
    }
    await this.audit.log({ action: 'client.create', entityType: 'client', entityId: client.id });
    return this.get(user, client.id);
  }

  async get(user: AuthUser, id: string) {
    const client = await this.db.tx.clientProfile.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        clientNumber: true,
        fullName: true,
        phone: true,
        whatsapp: true,
        email: true,
        birthDate: true,
        gender: true,
        hairType: true,
        tags: true,
        source: true,
        isBlocked: true,
        preferredSalonId: true,
        preferredStaff: { select: { id: true, displayName: true } },
        lastVisitAt: true,
        visitCount: true,
        totalSpent: true,
        noShowCount: true,
        creditBalance: true,
        createdAt: true,
        notes: { select: { id: true, body: true, isPinned: true, createdAt: true }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }], take: 50 },
      },
    });
    if (!client) throw new NotFoundException('Client introuvable.');
    const consents = await this.currentConsents(id);
    const upcoming = await this.db.tx.appointment.findMany({
      where: { clientId: id, startsAt: { gte: new Date() }, status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true, salonId: true, startsAt: true, status: true, items: { select: { serviceName: true, staff: { select: { displayName: true } } } } },
      orderBy: { startsAt: 'asc' },
      take: 10,
    });
    return { ...client, consents, upcomingAppointments: upcoming.filter((a) => canAccessSalon(user, a.salonId)) };
  }

  async update(user: AuthUser, id: string, dto: UpdateClientDto) {
    await this.assertExists(id);
    await this.assertReferences(user, dto);
    const { marketingConsent, birthDate, ...rest } = dto;
    await this.db.tx.clientProfile
      .update({
        where: { id },
        data: { ...rest, ...(birthDate !== undefined ? { birthDate: birthDate ? new Date(birthDate) : null } : {}) },
      })
      .catch((error) => this.rethrowDuplicatePhone(error));
    if (marketingConsent !== undefined) {
      await this.recordConsent(user, id, { type: 'MARKETING_WHATSAPP', granted: marketingConsent }, 'fiche');
      await this.recordConsent(user, id, { type: 'MARKETING_SMS', granted: marketingConsent }, 'fiche');
    }
    await this.audit.log({ action: 'client.update', entityType: 'client', entityId: id, after: JSON.parse(JSON.stringify(dto)) });
    return this.get(user, id);
  }

  /**
   * Droit à l'effacement : la fiche est anonymisée (les ventes et factures, obligatoires
   * en comptabilité, restent mais ne désignent plus personne).
   */
  async anonymize(id: string) {
    await this.assertExists(id);
    const tx = this.db.tx;
    await tx.clientTechnicalNote.deleteMany({ where: { clientId: id } });
    await tx.clientNote.deleteMany({ where: { clientId: id } });
    await tx.clientPhoto.deleteMany({ where: { clientId: id } });
    await tx.clientProfile.update({
      where: { id },
      data: {
        fullName: 'Client anonymisé',
        phone: null,
        whatsapp: null,
        email: null,
        birthDate: null,
        gender: null,
        hairType: null,
        tags: [],
        source: null,
        userId: null,
        anonymizedAt: new Date(),
        deletedAt: new Date(),
      },
    });
    await this.audit.log({ action: 'client.anonymize', entityType: 'client', entityId: id });
  }

  async history(user: AuthUser, id: string) {
    await this.assertExists(id);
    const salonFilter = user.allSalons ? {} : { salonId: { in: user.salonIds } };
    const [appointments, sales] = await Promise.all([
      this.db.tx.appointment.findMany({
        where: { clientId: id, ...salonFilter },
        select: {
          id: true,
          salonId: true,
          startsAt: true,
          status: true,
          estimatedTotal: true,
          items: { select: { serviceName: true, price: true, staff: { select: { displayName: true } } } },
        },
        orderBy: { startsAt: 'desc' },
        take: 100,
      }),
      this.db.tx.sale.findMany({
        where: { clientId: id, ...salonFilter },
        select: { id: true, number: true, salonId: true, status: true, total: true, tipTotal: true, createdAt: true, items: { select: { label: true, quantity: true, lineTotal: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { appointments, sales };
  }

  async addNote(user: AuthUser, id: string, dto: NoteDto) {
    await this.assertExists(id);
    return this.db.tx.clientNote.create({
      data: { tenantId: this.db.tenantId!, clientId: id, body: dto.body, isPinned: dto.isPinned ?? false, createdBy: user.userId },
      select: { id: true, body: true, isPinned: true, createdAt: true },
    });
  }

  async deleteNote(id: string, noteId: string) {
    const deleted = await this.db.tx.clientNote.deleteMany({ where: { id: noteId, clientId: id } });
    if (deleted.count === 0) throw new NotFoundException('Note introuvable.');
  }

  /** Fiche technique : déchiffrée à la lecture, chaque consultation est journalisée. */
  async technicalNotes(id: string) {
    await this.assertExists(id);
    const rows = await this.db.tx.clientTechnicalNote.findMany({
      where: { clientId: id },
      select: { id: true, kind: true, contentEnc: true, appointmentId: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    await this.audit.log({ action: 'client.technical_read', entityType: 'client', entityId: id });
    return Promise.all(
      rows.map(async ({ contentEnc, ...row }) => ({ ...row, content: await this.tenantCrypto.decrypt(contentEnc) })),
    );
  }

  async addTechnicalNote(user: AuthUser, id: string, dto: TechnicalNoteDto) {
    await this.assertExists(id);
    if (dto.appointmentId) {
      const appointment = await this.db.tx.appointment.findFirst({ where: { id: dto.appointmentId, clientId: id }, select: { id: true } });
      if (!appointment) throw new BadRequestException('Rendez-vous inconnu pour ce client.');
    }
    const note = await this.db.tx.clientTechnicalNote.create({
      data: {
        tenantId: this.db.tenantId!,
        clientId: id,
        kind: dto.kind,
        contentEnc: await this.tenantCrypto.encrypt(dto.content),
        appointmentId: dto.appointmentId ?? null,
        createdBy: user.userId,
      },
      select: { id: true, kind: true, appointmentId: true, createdAt: true },
    });
    await this.audit.log({ action: 'client.technical_write', entityType: 'client', entityId: id });
    return { ...note, content: dto.content };
  }

  async recordConsent(user: AuthUser, id: string, dto: ConsentDto, source = 'fiche') {
    await this.assertExists(id);
    await this.db.tx.clientConsent.createMany({
      data: [{ tenantId: this.db.tenantId!, clientId: id, type: dto.type, granted: dto.granted, source, recordedBy: user.userId }],
    });
    return this.currentConsents(id);
  }

  /** Dernier état de chaque consentement (l'historique complet reste en base). */
  private async currentConsents(clientId: string) {
    const rows = await this.db.tx.clientConsent.findMany({
      where: { clientId },
      select: { type: true, granted: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const current: Record<string, { granted: boolean; since: Date }> = {};
    for (const row of rows) {
      if (!current[row.type]) current[row.type] = { granted: row.granted, since: row.createdAt };
    }
    return current;
  }

  private async assertExists(id: string) {
    const exists = await this.db.tx.clientProfile.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!exists) throw new NotFoundException('Client introuvable.');
  }

  private async assertReferences(user: AuthUser, dto: { preferredSalonId?: string; preferredStaffId?: string }) {
    if (dto.preferredSalonId) {
      const salon = await this.db.tx.salon.findFirst({ where: { id: dto.preferredSalonId, deletedAt: null }, select: { id: true } });
      if (!salon || !canAccessSalon(user, salon.id)) throw new BadRequestException('Salon inconnu.');
    }
    if (dto.preferredStaffId) {
      const staff = await this.db.tx.staffMember.findFirst({ where: { id: dto.preferredStaffId }, select: { id: true } });
      if (!staff) throw new BadRequestException('Employé inconnu.');
    }
  }

  private rethrowDuplicatePhone(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Un client avec ce numéro de téléphone existe déjà.');
    }
    throw error;
  }
}
