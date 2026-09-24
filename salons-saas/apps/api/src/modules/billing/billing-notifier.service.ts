import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MessagingService } from '../../core/messaging/messaging.service';
import { OWNER_ROLE_CODE } from '../../core/permissions/catalog';
import { PlatformTx } from '../../core/platform/platform-db.service';

export interface BillingAlert {
  event: string;
  title: string;
  body: string;
  /** Clé d'unicité : la même alerte n'est jamais émise deux fois. */
  dedupeKey: string;
  actionUrl?: string;
  /** Aussi par SMS / WhatsApp (événements importants : fin d'essai, suspension, paiement). */
  sms?: boolean;
}

const moneyFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const formatMoney = (amount: bigint | number, currency = 'XOF') =>
  `${moneyFormat.format(Number(amount))} ${currency === 'XOF' ? 'FCFA' : currency}`;
export const formatDate = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date);

/**
 * Alertes de facturation envoyées aux responsables de l'abonnement d'un salon :
 * propriétaires et membres ayant la permission « billing.manage ».
 * - notification dans l'application (toujours) ;
 * - SMS / WhatsApp pour les événements importants, via MessagingService.
 * L'unicité (tenant_id, dedupe_key) rend l'envoi idempotent : le planificateur peut
 * repasser autant de fois qu'il veut.
 */
@Injectable()
export class BillingNotifier {
  private readonly logger = new Logger(BillingNotifier.name);

  constructor(private readonly messaging: MessagingService) {}

  async notify(tx: PlatformTx, tenantId: string, alert: BillingAlert): Promise<number> {
    const recipients = await tx.membership.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              OR: [
                { code: OWNER_ROLE_CODE, isSystem: true },
                { permissions: { some: { permissionCode: 'billing.manage' } } },
              ],
            },
          },
        },
      },
      select: { userId: true, user: { select: { phone: true } } },
    });

    let created = 0;
    for (const recipient of recipients) {
      const channels = alert.sms ? (['IN_APP', 'SMS'] as const) : (['IN_APP'] as const);
      for (const channel of channels) {
        const inserted = await tx.notification.createMany({
          data: [
            {
              tenantId,
              recipientUserId: recipient.userId,
              channel,
              event: alert.event,
              title: alert.title,
              body: alert.body,
              actionUrl: alert.actionUrl ?? '/abonnement',
              destination: channel === 'SMS' ? recipient.user.phone : null,
              status: channel === 'IN_APP' ? 'DELIVERED' : 'QUEUED',
              dedupeKey: `${alert.dedupeKey}:${recipient.userId}:${channel}`,
              relatedEntity: 'billing',
              sentAt: channel === 'IN_APP' ? new Date() : null,
            },
          ],
          skipDuplicates: true,
        });
        if (inserted.count === 0) continue; // déjà envoyée
        created += 1;
        if (channel === 'SMS') await this.sendSms(tx, tenantId, alert, recipient.user.phone, `${alert.dedupeKey}:${recipient.userId}:SMS`);
      }
    }
    return created;
  }

  private async sendSms(tx: PlatformTx, tenantId: string, alert: BillingAlert, phone: string, dedupeKey: string) {
    try {
      await this.messaging.send({ to: phone, purpose: `BILLING:${alert.event}`, text: `${alert.title}. ${alert.body}` });
      await tx.notification.updateMany({ where: { tenantId, dedupeKey }, data: { status: 'SENT', sentAt: new Date() } });
    } catch (error) {
      this.logger.error(`Envoi SMS de facturation impossible : ${(error as Error).message}`);
      await tx.notification.updateMany({
        where: { tenantId, dedupeKey },
        data: { status: 'FAILED', error: (error as Error).message.slice(0, 300) } satisfies Prisma.NotificationUpdateManyMutationInput,
      });
    }
  }
}
