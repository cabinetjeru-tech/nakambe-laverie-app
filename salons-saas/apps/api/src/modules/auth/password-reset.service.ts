import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { SessionService } from '../../core/auth/session.service';
import { DbContext, DbService } from '../../core/db/db.service';
import { MessagingService } from '../../core/messaging/messaging.service';
import { CryptoService } from '../../core/security/crypto.service';
import { PasswordService } from '../../core/security/password.service';

const CODE_TTL_MINUTES = 15;
const MAX_CODES_PER_HOUR = 3;
const MAX_ATTEMPTS_PER_CODE = 5;
const INVALID_CODE = 'Code invalide ou expiré. Demandez un nouveau code.';

/**
 * Récupération du mot de passe par code à 6 chiffres envoyé au téléphone.
 * - La demande répond toujours la même chose : on ne révèle pas si un numéro a un compte.
 * - 3 codes par heure et par numéro, 15 min de validité, 5 essais par code.
 * - Seule l'empreinte HMAC du code est stockée.
 * - Réussite : mot de passe changé, verrouillage levé, TOUTES les sessions révoquées.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
  ) {}

  async request(phone: string): Promise<void> {
    const user = await this.db.tx.user.findUnique({ where: { phone }, select: { id: true, status: true } });
    if (!user || user.status === 'DISABLED') return;

    const recent = await this.db.tx.verificationCode.count({
      where: { target: phone, purpose: 'PASSWORD_RESET', createdAt: { gt: new Date(Date.now() - 3600_000) } },
    });
    if (recent >= MAX_CODES_PER_HOUR) return;

    // Un seul code valable à la fois.
    await this.db.tx.verificationCode.updateMany({
      where: { target: phone, purpose: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    });
    const code = this.crypto.numericCode(6);
    await this.db.tx.verificationCode.create({
      data: {
        target: phone,
        purpose: 'PASSWORD_RESET',
        codeHash: this.crypto.fingerprint(`${phone}:${code}`),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    });
    await this.messaging.send({
      to: phone,
      purpose: 'PASSWORD_RESET',
      code,
      text: `Votre code de réinitialisation : ${code}. Valable ${CODE_TTL_MINUTES} minutes. Ne le communiquez à personne.`,
    });
    await this.db.setContext({ userId: user.id });
    await this.audit.log({ action: 'auth.password_reset_requested', entityType: 'user', entityId: user.id });
  }

  /** Transaction propre : le compteur d'essais doit être enregistré même en cas d'échec. */
  async reset(phone: string, code: string, newPassword: string, context: DbContext): Promise<void> {
    const ok = await this.db.withContext(context, async () => {
      const row = await this.db.tx.verificationCode.findFirst({
        where: { target: phone, purpose: 'PASSWORD_RESET', usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!row) return false;

      if (row.attempts >= MAX_ATTEMPTS_PER_CODE) {
        await this.db.tx.verificationCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
        return false;
      }
      if (!this.crypto.safeEqual(row.codeHash, this.crypto.fingerprint(`${phone}:${code}`))) {
        await this.db.tx.verificationCode.update({
          where: { id: row.id },
          data: {
            attempts: { increment: 1 },
            ...(row.attempts + 1 >= MAX_ATTEMPTS_PER_CODE ? { usedAt: new Date() } : {}),
          },
        });
        return false;
      }

      const user = await this.db.tx.user.findUnique({ where: { phone }, select: { id: true, status: true } });
      if (!user || user.status === 'DISABLED') return false;
      await this.db.setContext({ userId: user.id });

      await this.db.tx.verificationCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      await this.db.tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await this.passwords.hash(newPassword),
          failedLogins: 0,
          lockedUntil: null,
          // Recevoir le code prouve la possession du numéro.
          phoneVerifiedAt: new Date(),
        },
      });
      await this.sessions.revokeAllForUser(user.id);
      await this.audit.log({ action: 'auth.password_reset', entityType: 'user', entityId: user.id });
      return true;
    });
    if (!ok) throw new BadRequestException(INVALID_CODE);
  }
}
