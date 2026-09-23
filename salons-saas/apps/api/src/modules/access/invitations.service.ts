import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { IssuedSession, SessionService } from '../../core/auth/session.service';
import { DbService } from '../../core/db/db.service';
import { isUuid } from '../../core/http/parse-id.pipe';
import { MessagingService } from '../../core/messaging/messaging.service';
import { CryptoService } from '../../core/security/crypto.service';
import { PasswordService } from '../../core/security/password.service';
import { TenantDefaultsService } from '../../core/tenant/tenant-defaults.service';
import { AcceptInvitationDto } from '../auth/dto/auth.dto';
import { AccessPolicyService } from './access-policy.service';
import { CreateInvitationDto } from './dto/access.dto';

const INVITATION_TTL_HOURS = 72;
const INVALID_INVITATION = 'Invitation invalide ou expirée. Demandez une nouvelle invitation.';

/**
 * Invitations du personnel. Le jeton a la forme « <tenantId>.<aléa> » : la partie publique
 * permet de retrouver l'entreprise (et donc d'ouvrir le bon contexte RLS) ; seule l'empreinte
 * du jeton complet est stockée.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly db: DbService,
    private readonly policy: AccessPolicyService,
    private readonly crypto: CryptoService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
    private readonly defaults: TenantDefaultsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(user: AuthUser, dto: CreateInvitationDto) {
    const actor = await this.policy.actor(user);
    const tx = this.db.tx;

    const role = await tx.role.findFirst({
      where: { id: dto.roleId },
      select: { id: true, code: true, isSystem: true, permissions: { select: { permissionCode: true } } },
    });
    if (!role) throw new BadRequestException('Rôle inconnu.');
    this.policy.assertCanAssignRoles(actor, [role]);

    const salonIds = dto.allSalons ? [] : [...new Set(dto.salonIds)];
    if (!dto.allSalons && salonIds.length === 0) throw new BadRequestException('Choisissez au moins un salon.');
    this.policy.assertCanGrantSalonScope(actor, dto.allSalons, salonIds);
    await this.policy.assertSalonsExist(salonIds);

    const existingUser = await tx.user.findUnique({ where: { phone: dto.phone }, select: { id: true } });
    if (existingUser) {
      const member = await tx.membership.findFirst({ where: { userId: existingUser.id, status: 'ACTIVE' }, select: { id: true } });
      if (member) throw new ConflictException('Cette personne fait déjà partie de votre équipe.');
    }
    // Une seule invitation en cours par numéro (la précédente ne compte plus dans le quota).
    await tx.invitation.updateMany({
      where: { phone: dto.phone, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.assertStaffQuota(actor.tenantId);
    const token = `${actor.tenantId}.${this.crypto.randomToken()}`;
    const invitation = await tx.invitation.create({
      data: {
        tenantId: actor.tenantId,
        phone: dto.phone,
        roleId: role.id,
        salonIds,
        tokenHash: this.crypto.fingerprint(token),
        invitedBy: user.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * 3600_000),
      },
      select: { id: true, phone: true, expiresAt: true },
    });

    const link = `${this.config.APP_PUBLIC_URL}/invitation#${token}`;
    await this.messaging.send({
      to: dto.phone,
      purpose: 'INVITATION',
      code: token,
      text: `Vous êtes invité(e) à rejoindre l'équipe sur la plateforme. Activez votre accès : ${link}`,
    });
    await this.audit.log({ action: 'invitation.create', entityType: 'invitation', entityId: invitation.id, after: { phone: dto.phone, role: role.code, salonIds } });

    // Le lien est aussi renvoyé à l'auteur : il peut le transmettre par WhatsApp tant
    // qu'aucun fournisseur SMS n'est branché.
    return { ...invitation, role: role.code, allSalons: dto.allSalons, salonIds, link };
  }

  async listPending() {
    return this.db.tx.invitation.findMany({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, phone: true, salonIds: true, expiresAt: true, createdAt: true, role: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(user: AuthUser, invitationId: string) {
    const actor = await this.policy.actor(user);
    const invitation = await this.db.tx.invitation.findFirst({
      where: { id: invitationId, acceptedAt: null, revokedAt: null },
      select: { id: true, salonIds: true },
    });
    if (!invitation) throw new NotFoundException('Invitation introuvable.');
    if (!actor.allSalons && (invitation.salonIds.length === 0 || invitation.salonIds.some((id) => !actor.salonIds.includes(id)))) {
      throw new NotFoundException('Invitation introuvable.');
    }
    await this.db.tx.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
    await this.audit.log({ action: 'invitation.revoke', entityType: 'invitation', entityId: invitationId });
  }

  /** Acceptation (route publique) : crée le compte si besoin, puis l'adhésion. */
  async accept(dto: AcceptInvitationDto): Promise<IssuedSession> {
    const [tenantId] = dto.token.split('.');
    if (!tenantId || !isUuid(tenantId)) throw new BadRequestException(INVALID_INVITATION);
    await this.db.setContext({ tenantId });
    const tx = this.db.tx;

    const invitation = await tx.invitation.findFirst({
      where: { tokenHash: this.crypto.fingerprint(dto.token), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, phone: true, roleId: true, salonIds: true, tenant: { select: { status: true } } },
    });
    if (!invitation || invitation.tenant.status === 'CANCELLED') throw new BadRequestException(INVALID_INVITATION);

    let user = await tx.user.findUnique({
      where: { phone: invitation.phone },
      select: { id: true, fullName: true, passwordHash: true, status: true, lockedUntil: true },
    });
    if (user) {
      // Compte existant : même exigence qu'une connexion (y compris le verrouillage en cours).
      const locked = user.lockedUntil !== null && user.lockedUntil > new Date();
      if (locked || user.status === 'DISABLED' || !(await this.passwords.verify(user.passwordHash, dto.password))) {
        throw new UnauthorizedException('Ce numéro a déjà un compte : saisissez son mot de passe actuel.');
      }
    } else {
      if (!dto.fullName) throw new BadRequestException('Indiquez votre nom complet.');
      if (dto.password.length < 8) throw new BadRequestException('Le mot de passe doit contenir au moins 8 caractères.');
      user = await tx.user.create({
        data: { phone: invitation.phone, fullName: dto.fullName, passwordHash: await this.passwords.hash(dto.password) },
        select: { id: true, fullName: true, passwordHash: true, status: true, lockedUntil: true },
      });
    }
    await this.db.setContext({ userId: user.id });

    const allSalons = invitation.salonIds.length === 0;
    const existing = await tx.membership.findFirst({ where: { userId: user.id }, select: { id: true, status: true } });
    if (existing?.status === 'ACTIVE') throw new ConflictException('Vous faites déjà partie de cette équipe.');
    if (existing?.status === 'SUSPENDED') {
      throw new ForbiddenException('Votre accès à cette entreprise est suspendu : contactez son responsable.');
    }

    const membership = existing
      ? await tx.membership.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', allSalons, leftAt: null, permissionsVersion: { increment: 1 } },
          select: { id: true },
        })
      : await tx.membership.create({ data: { tenantId, userId: user.id, allSalons }, select: { id: true } });

    await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await tx.membershipRole.create({ data: { tenantId, membershipId: membership.id, roleId: invitation.roleId } });
    await tx.membershipSalon.deleteMany({ where: { membershipId: membership.id } });
    if (!allSalons) {
      await tx.membershipSalon.createMany({ data: invitation.salonIds.map((salonId) => ({ tenantId, membershipId: membership.id, salonId })) });
    }

    // Profil professionnel, réservable dans les salons de son périmètre.
    const staff =
      (await tx.staffMember.findFirst({ where: { membershipId: membership.id }, select: { id: true } })) ??
      (await tx.staffMember.create({ data: { tenantId, membershipId: membership.id, displayName: user.fullName }, select: { id: true } }));
    const salons = allSalons
      ? (await tx.salon.findMany({ where: { deletedAt: null }, select: { id: true } })).map((s) => s.id)
      : invitation.salonIds;
    await tx.staffSalon.createMany({ data: salons.map((salonId) => ({ tenantId, staffId: staff.id, salonId })), skipDuplicates: true });
    for (const salonId of salons) await this.defaults.ensureStaffSchedule(staff.id, salonId);

    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    await this.audit.log({ action: 'invitation.accept', entityType: 'membership', entityId: membership.id });
    return this.sessions.open(user.id, tenantId);
  }

  private async assertStaffQuota(tenantId: string) {
    const tenant = await this.db.tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { plan: { select: { maxStaff: true } } } });
    const max = tenant.plan.maxStaff;
    if (max === null) return;
    const active = await this.db.tx.membership.count({ where: { status: 'ACTIVE' } });
    const pending = await this.db.tx.invitation.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (active + pending >= max) {
      throw new ForbiddenException(`Votre offre est limitée à ${max} membres. Passez à l'offre supérieure pour agrandir l'équipe.`);
    }
  }
}
