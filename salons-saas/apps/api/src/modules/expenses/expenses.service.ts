import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { toMoney } from '../../core/http/money';
import { assertSalonAccess, salonIdFilter } from '../../core/permissions/salon-scope';
import { LedgerLine, LedgerService } from '../../core/tenant/ledger.service';
import { TenantDefaultsService } from '../../core/tenant/tenant-defaults.service';
import { accountForPaymentMethod } from '../cash/cash-accounts';
import { OpenSessionService } from '../cash/open-session.service';
import { CreateExpenseDto, ExpenseCategoryDto, ExpenseQueryDto } from './dto/expense.dto';

/**
 * Dépenses des salons. Chaque dépense est inscrite au registre (charges / moyen de
 * paiement) ; une dépense payée en espèces sort de la caisse ouverte et entre donc dans
 * le calcul du montant attendu à la clôture.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly db: DbService,
    private readonly ledger: LedgerService,
    private readonly sessions: OpenSessionService,
    private readonly defaults: TenantDefaultsService,
    private readonly audit: AuditService,
  ) {}

  async categories() {
    await this.defaults.ensureExpenseCategories();
    return this.db.tx.expenseCategory.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  async createCategory(dto: ExpenseCategoryDto) {
    return this.db.tx.expenseCategory.create({ data: { tenantId: this.db.tenantId!, name: dto.name }, select: { id: true, name: true } });
  }

  /** Avec la seule permission de saisie, on ne voit que ses propres dépenses. */
  async list(user: AuthUser, query: ExpenseQueryDto) {
    if (query.salonId) assertSalonAccess(user, query.salonId);
    const seeAll = user.permissions.includes('expenses.manage');
    return this.db.tx.expense.findMany({
      where: {
        deletedAt: null,
        salonId: query.salonId ?? salonIdFilter(user),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.from || query.to
          ? { spentAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
          : {}),
        ...(seeAll ? {} : { createdBy: user.userId }),
      },
      select: {
        id: true,
        salonId: true,
        label: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        reference: true,
        spentAt: true,
        createdAt: true,
        cashSessionId: true,
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async create(user: AuthUser, dto: CreateExpenseDto) {
    assertSalonAccess(user, dto.salonId);
    const salon = await this.db.tx.salon.findFirst({ where: { id: dto.salonId, deletedAt: null }, select: { id: true, currency: true, timezone: true } });
    if (!salon) throw new NotFoundException('Salon introuvable.');
    const category = await this.db.tx.expenseCategory.findFirst({ where: { id: dto.categoryId, isActive: true } });
    if (!category) throw new BadRequestException('Catégorie inconnue.');
    if (dto.supplierId) {
      const supplier = await this.db.tx.supplier.findFirst({ where: { id: dto.supplierId }, select: { id: true } });
      if (!supplier) throw new BadRequestException('Fournisseur inconnu.');
    }
    const spentAt = DateTime.fromISO(dto.spentAt, { zone: salon.timezone });
    if (spentAt > DateTime.now().setZone(salon.timezone).endOf('day')) {
      throw new BadRequestException('Une dépense ne peut pas être datée dans le futur.');
    }
    const session = dto.paymentMethod === 'CASH' ? await this.sessions.require(salon.id) : null;
    const amount = toMoney(dto.amount);

    const expense = await this.db.tx.expense.create({
      data: {
        tenantId: this.db.tenantId!,
        salonId: salon.id,
        categoryId: category.id,
        supplierId: dto.supplierId ?? null,
        cashSessionId: session?.id ?? null,
        label: dto.label.trim(),
        amount,
        currency: salon.currency,
        paymentMethod: dto.paymentMethod,
        reference: dto.reference ?? null,
        spentAt: new Date(dto.spentAt),
        createdBy: user.userId,
      },
      select: { id: true },
    });
    await this.ledger.post(this.lines(dto.paymentMethod, amount), {
      salonId: salon.id,
      currency: salon.currency,
      expenseId: expense.id,
      cashSessionId: session?.id,
      description: `Dépense : ${dto.label}`,
    });
    await this.audit.log({ action: 'expense.create', entityType: 'expense', entityId: expense.id, salonId: salon.id, after: { amount: dto.amount, label: dto.label } });
    return (await this.list(user, { salonId: salon.id })).find((e) => e.id === expense.id);
  }

  /** Suppression = écriture inverse au registre ; la dépense reste consultable dans l'audit. */
  async remove(user: AuthUser, id: string, reason: string) {
    const expense = await this.db.tx.expense.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, salonId: true, amount: true, currency: true, paymentMethod: true, cashSessionId: true, label: true },
    });
    if (!expense) throw new NotFoundException('Dépense introuvable.');
    assertSalonAccess(user, expense.salonId);
    if (expense.cashSessionId) {
      const session = await this.db.tx.cashSession.findFirst({ where: { id: expense.cashSessionId }, select: { status: true } });
      if (session?.status !== 'OPEN') {
        throw new ConflictException('Cette dépense en espèces appartient à une caisse déjà clôturée : elle ne peut plus être supprimée.');
      }
    }
    await this.db.tx.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.ledger.post(this.ledger.reverse(this.lines(expense.paymentMethod, expense.amount)), {
      salonId: expense.salonId,
      currency: expense.currency,
      expenseId: id,
      cashSessionId: expense.cashSessionId ?? undefined,
      description: `Annulation dépense : ${expense.label} (${reason})`,
    });
    await this.audit.log({ action: 'expense.delete', entityType: 'expense', entityId: id, salonId: expense.salonId, after: { reason } });
  }

  private lines(method: string, amount: bigint): LedgerLine[] {
    return [
      { account: 'EXPENSES', debit: amount },
      { account: accountForPaymentMethod(method), credit: amount },
    ];
  }
}
