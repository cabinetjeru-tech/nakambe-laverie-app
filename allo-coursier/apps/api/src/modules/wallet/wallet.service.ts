import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerTransactionType, PayoutStatus, Prisma, WalletKind } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { assertCityAccess, AuthUser } from '../../common/auth-user';
import { paginate } from '../../common/dto/pagination.dto';
import { PERMISSIONS } from '../../common/permissions';
import { normalizeBurkinaPhone } from '../../common/utils/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { LedgerService } from './ledger.service';
import { AdjustWalletDto, CashSettlementDto, PayoutQueryDto, PayoutRequestDto, SettlementQueryDto, WalletQueryDto } from './wallet.dto';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private settings: SettingsService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  async myWallet(userId: string, kind: 'CLIENT' | 'DRIVER') {
    const wallet = await this.ledger.userWallet(kind, userId);
    const entries = await this.ledger.entries(wallet.id, 50);
    return { id: wallet.id, kind, balance: wallet.balance, currency: wallet.currency, entries: entries.items };
  }

  // ------------------------------------------------------------------ retraits (livreurs indépendants)

  async requestPayout(driverId: string, dto: PayoutRequestDto) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId: driverId } });
    if (!driver) throw new BadRequestException('Ce compte n’est pas un compte livreur.');
    if (driver.employmentType === 'SALARIE') throw new BadRequestException('Les livreurs salariés sont payés par salaire.');
    const phone = normalizeBurkinaPhone(dto.destinationPhone);
    if (!phone) throw new BadRequestException('Numéro Mobile Money invalide.');
    const min = await this.settings.get('payouts.minAmount');
    if (dto.amount < min) throw new BadRequestException(`Montant minimum : ${min} FCFA.`);
    const wallet = await this.ledger.userWallet('DRIVER', driverId);
    if (dto.amount > wallet.balance) throw new BadRequestException(`Solde disponible : ${Math.max(0, wallet.balance)} FCFA.`);
    const pending = await this.prisma.payoutRequest.count({ where: { walletId: wallet.id, status: { in: [PayoutStatus.PENDING, PayoutStatus.APPROVED] } } });
    if (pending > 0) throw new BadRequestException('Une demande de retrait est déjà en cours.');
    const payout = await this.prisma.payoutRequest.create({
      data: { walletId: wallet.id, amount: dto.amount, method: 'MOBILE_MONEY', destinationPhone: phone },
    });
    await this.notifications.notifyStaff(PERMISSIONS.WALLETS_MANAGE.code, {
      type: 'ADMIN_ALERT',
      title: 'Demande de retrait livreur',
      body: `${dto.amount} FCFA à envoyer au ${phone}.`,
      url: '/admin/finances',
    });
    return payout;
  }

  async myPayouts(driverId: string) {
    const wallet = await this.ledger.userWallet('DRIVER', driverId);
    return this.prisma.payoutRequest.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async listPayouts(query: PayoutQueryDto) {
    const where: Prisma.PayoutRequestWhereInput = { status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payoutRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(query),
        include: { wallet: { select: { balance: true, kind: true, user: { select: { id: true, firstName: true, lastName: true, phone: true } }, merchant: { select: { id: true, name: true, phone: true } } } } },
      }),
      this.prisma.payoutRequest.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** L'équipe a envoyé l'argent : le portefeuille du livreur est débité. */
  async payPayout(id: string, reference: string, actorId: string) {
    const payout = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payoutRequest.findUnique({ where: { id }, include: { wallet: true } });
      if (!p) throw new NotFoundException('Demande introuvable.');
      if (p.status !== PayoutStatus.PENDING && p.status !== PayoutStatus.APPROVED) throw new BadRequestException('Demande déjà traitée.');
      const external = await this.ledger.systemWallet('CASH_CLEARING', tx);
      await this.ledger.post(
        {
          type: LedgerTransactionType.WITHDRAWAL,
          description: `${p.wallet.merchantId ? 'Reversement commerçant' : 'Retrait livreur'} vers ${p.destinationPhone} (réf. ${reference})`,
          createdById: actorId,
          lines: [
            { walletId: p.walletId, amount: -p.amount, mustStayPositive: true },
            { walletId: external.id, amount: p.amount },
          ],
        },
        tx,
      );
      return tx.payoutRequest.update({
        where: { id },
        data: { status: PayoutStatus.PAID, reference, processedById: actorId, processedAt: new Date() },
        include: { wallet: true },
      });
    });
    await this.audit.log({ actorId, action: 'payout.pay', entityType: 'PayoutRequest', entityId: id, after: payout });
    await this.notifyPayoutOwner(payout.wallet, {
      title: 'Retrait envoyé 💸',
      body: `${payout.amount} FCFA ont été envoyés sur votre Mobile Money (réf. ${reference}).`,
    });
    return payout;
  }

  async rejectPayout(id: string, reason: string, actorId: string) {
    const updated = await this.prisma.payoutRequest.updateMany({
      where: { id, status: { in: [PayoutStatus.PENDING, PayoutStatus.APPROVED] } },
      data: { status: PayoutStatus.REJECTED, reference: reason, processedById: actorId, processedAt: new Date() },
    });
    if (updated.count === 0) throw new BadRequestException('Demande introuvable ou déjà traitée.');
    const payout = await this.prisma.payoutRequest.findUniqueOrThrow({ where: { id }, include: { wallet: true } });
    await this.audit.log({ actorId, action: 'payout.reject', entityType: 'PayoutRequest', entityId: id, after: { reason } });
    await this.notifyPayoutOwner(payout.wallet, { title: 'Retrait refusé', body: reason });
    return payout;
  }

  /** Prévient le livreur, ou le propriétaire du commerce, du traitement de sa demande. */
  private async notifyPayoutOwner(wallet: { userId: string | null; merchantId: string | null }, message: { title: string; body: string }) {
    if (wallet.userId) {
      await this.notifications.notify(wallet.userId, { type: 'PAYMENT', ...message, url: '/livreur/gains' });
    } else if (wallet.merchantId) {
      const owners = await this.prisma.merchantMember.findMany({ where: { merchantId: wallet.merchantId, role: 'OWNER' }, select: { userId: true } });
      if (owners.length) await this.notifications.notify(owners.map((o) => o.userId), { type: 'PAYMENT', ...message, url: '/commercant/finances' });
    }
  }

  // ------------------------------------------------------------------ espèces des livreurs

  /** Le livreur remet à l'entreprise les espèces encaissées : sa dette diminue. */
  async recordCashSettlement(driverId: string, dto: CashSettlementDto, actor: AuthUser) {
    const actorId = actor.id;
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId: driverId } });
    if (!driver) throw new NotFoundException('Livreur introuvable.');
    assertCityAccess(actor, driver.cityId);
    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.ledger.userWallet('DRIVER', driverId, tx);
      const external = await this.ledger.systemWallet('CASH_CLEARING', tx);
      const settlement = await tx.cashSettlement.create({
        data: { driverId, amount: dto.amount, receivedById: actorId, method: dto.method, reference: dto.reference, note: dto.note },
      });
      await this.ledger.post(
        {
          type: LedgerTransactionType.CASH_SETTLEMENT,
          description: `Versement d'espèces du livreur (${dto.method === 'ESPECES' ? 'espèces' : 'Mobile Money'})`,
          createdById: actorId,
          lines: [
            { walletId: wallet.id, amount: dto.amount },
            { walletId: external.id, amount: -dto.amount },
          ],
        },
        tx,
      );
      const after = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      return { settlement, balance: after.balance };
    });
    await this.audit.log({ actorId, action: 'cash_settlement.create', entityType: 'CashSettlement', entityId: result.settlement.id, after: result });
    await this.notifications.notify(driverId, {
      type: 'PAYMENT',
      title: 'Versement enregistré',
      body: `${dto.amount} FCFA reçus. ${result.balance < 0 ? `Reste à verser : ${-result.balance} FCFA.` : 'Vous êtes à jour.'}`,
      url: '/livreur/gains',
    });
    return result;
  }

  async listSettlements(query: SettlementQueryDto) {
    const where = { driverId: query.driverId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cashSettlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(query),
        include: { driver: { select: { user: { select: { firstName: true, lastName: true, phone: true } } } } },
      }),
      this.prisma.cashSettlement.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  // ------------------------------------------------------------------ vue d'ensemble

  async listWallets(query: WalletQueryDto) {
    const where: Prisma.WalletWhereInput = { kind: query.kind };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.wallet.findMany({
        where,
        orderBy: { balance: 'asc' },
        ...paginate(query),
        include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } }, merchant: { select: { id: true, name: true, phone: true } } },
      }),
      this.prisma.wallet.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async walletEntries(id: string, page = 1, pageSize = 50) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } }, merchant: { select: { id: true, name: true, phone: true } } },
    });
    if (!wallet) throw new NotFoundException('Portefeuille introuvable.');
    const entries = await this.ledger.entries(id, pageSize, (page - 1) * pageSize);
    return { wallet, ...entries, page, pageSize };
  }

  async summary() {
    const [platform, external] = await Promise.all([
      this.ledger.systemWallet('PLATFORM_REVENUE'),
      this.ledger.systemWallet('CASH_CLEARING'),
    ]);
    const [clientsCredit, driversOwed, driversDebt, merchantsOwed] = await Promise.all([
      this.prisma.wallet.aggregate({ where: { kind: WalletKind.CLIENT }, _sum: { balance: true } }),
      this.prisma.wallet.aggregate({ where: { kind: WalletKind.DRIVER, balance: { gt: 0 } }, _sum: { balance: true } }),
      this.prisma.wallet.aggregate({ where: { kind: WalletKind.DRIVER, balance: { lt: 0 } }, _sum: { balance: true } }),
      this.prisma.wallet.aggregate({ where: { kind: WalletKind.MERCHANT }, _sum: { balance: true } }),
    ]);
    return {
      platformBalance: platform.balance,
      externalFlows: external.balance,
      clientsCredit: clientsCredit._sum.balance ?? 0,
      owedToDrivers: driversOwed._sum.balance ?? 0,
      cashHeldByDrivers: -(driversDebt._sum.balance ?? 0),
      owedToMerchants: merchantsOwed._sum.balance ?? 0,
      pendingPayouts: await this.prisma.payoutRequest.count({ where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.APPROVED] } } }),
    };
  }

  /** Correction exceptionnelle (geste commercial, erreur) : contrepartie sur le compte plateforme. */
  async adjust(walletId: string, dto: AdjustWalletDto, actorId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Portefeuille introuvable.');
    if (wallet.kind === WalletKind.PLATFORM_REVENUE || wallet.kind === WalletKind.CASH_CLEARING) {
      throw new BadRequestException('Les comptes système ne se corrigent pas directement.');
    }
    await this.prisma.$transaction(async (tx) => {
      const platform = await this.ledger.systemWallet('PLATFORM_REVENUE', tx);
      await this.ledger.post(
        {
          type: LedgerTransactionType.ADJUSTMENT,
          description: `Correction : ${dto.reason}`,
          createdById: actorId,
          lines: [
            { walletId, amount: dto.amount, mustStayPositive: wallet.kind === WalletKind.CLIENT },
            { walletId: platform.id, amount: -dto.amount },
          ],
        },
        tx,
      );
    });
    await this.audit.log({ actorId, action: 'wallet.adjust', entityType: 'Wallet', entityId: walletId, after: dto });
    return this.walletEntries(walletId);
  }
}
