import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { formatFCFA } from '@dread-royal/shared';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { nextNumber } from '../../common/numbering';
import { Period } from '../../common/period';
import { CashEngine } from '../core/engines';
import { SettingsService } from '../settings/settings.module';

export class CreateExpenseDto {
  @IsUUID() categoryId: string;
  @IsString() @MinLength(2) @MaxLength(200) label: string;
  @IsInt() @Min(1) amount: number;
  @IsDateString() expenseDate: string;
  /** Montant payé immédiatement (par défaut : totalité). 0 = dette */
  @IsOptional() @IsInt() @Min(0) paidAmount?: number;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class PayDto {
  @IsInt() @Min(1) amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}
export class CancelDto {
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}
export class CreateIncomeDto {
  @IsString() @MinLength(2) @MaxLength(200) label: string;
  @IsString() @MinLength(2) @MaxLength(60) category: string;
  @IsInt() @Min(1) amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsDateString() incomeDate: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

const METHODS: PaymentMethod[] = ['CASH', 'ORANGE_MONEY', 'MOOV_MONEY', 'BANK_TRANSFER', 'OTHER'];

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService, private audit: AuditService, private cash: CashEngine, private settings: SettingsService) {}

  // ─────────── Dépenses ───────────
  categories() {
    return this.prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  listExpenses(q: { from?: string; to?: string; categoryId?: string; status?: string; search?: string }) {
    const where: Prisma.ExpenseWhereInput = {};
    if (q.from || q.to) where.expenseDate = { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) };
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.status) where.status = { in: q.status.split(',') as any };
    if (q.search) where.OR = [{ label: { contains: q.search, mode: 'insensitive' } }, { number: { contains: q.search, mode: 'insensitive' } }];
    return this.prisma.expense.findMany({ where, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }], take: 1000, include: { category: true, supplier: { select: { name: true } }, payments: true } });
  }

  private async payExpenseTx(tx: Tx, expenseId: string, dto: PayDto, user: AuthUser, label: string, source: 'EXPENSE' | 'COMMISSION_PAYOUT' = 'EXPENSE') {
    if (['ORANGE_MONEY', 'MOOV_MONEY', 'BANK_TRANSFER'].includes(dto.method) && !dto.reference?.trim() && source === 'EXPENSE') {
      // Référence recommandée mais non bloquante pour les dépenses
    }
    if (dto.method === 'CASH') await this.cash.record(tx, { type: 'OUT', source, amount: dto.amount, label, referenceId: expenseId, userId: user.id });
    await tx.supplierPayment.create({ data: { expenseId, amount: dto.amount, method: dto.method, reference: dto.reference, paidById: user.id } });
  }

  async createExpense(dto: CreateExpenseDto, user: AuthUser, ip?: string, txIn?: Tx, source: 'EXPENSE' | 'COMMISSION_PAYOUT' = 'EXPENSE') {
    const run = async (tx: Tx) => {
      const cat = await tx.expenseCategory.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new BadRequestException('Catégorie de dépense inconnue');
      const paid = dto.paidAmount ?? dto.amount;
      if (paid > dto.amount) throw new BadRequestException('Le montant payé dépasse le montant de la dépense');
      if (paid > 0 && !dto.method) throw new BadRequestException('Précisez le moyen de paiement');
      const number = await nextNumber(tx, 'DEP');
      const e = await tx.expense.create({
        data: {
          number, categoryId: dto.categoryId, supplierId: dto.supplierId, label: dto.label, amount: dto.amount, paidAmount: paid,
          status: paid === 0 ? 'UNPAID' : paid < dto.amount ? 'PARTIAL' : 'PAID', expenseDate: new Date(dto.expenseDate), method: dto.method, reference: dto.reference, notes: dto.notes, createdById: user.id,
        },
        include: { category: true },
      });
      if (paid > 0) await this.payExpenseTx(tx, e.id, { amount: paid, method: dto.method!, reference: dto.reference }, user, `Dépense ${number} — ${dto.label}`, source);
      await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'Expense', entityId: e.id, summary: `Dépense ${number} ${cat.name} : ${formatFCFA(dto.amount)} — ${dto.label}`, after: e, ip }, tx);
      return e;
    };
    return txIn ? run(txIn) : this.prisma.tx(run);
  }

  async payExpense(id: string, dto: PayDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} FOR UPDATE`;
      const e = await tx.expense.findUnique({ where: { id } });
      if (!e) throw new NotFoundException('Dépense introuvable');
      if (e.status === 'CANCELLED') throw new BadRequestException('Dépense annulée');
      if (dto.amount > e.amount - e.paidAmount) throw new BadRequestException(`Reste à payer : ${formatFCFA(e.amount - e.paidAmount)}`);
      await this.payExpenseTx(tx, id, dto, user, `Règlement dépense ${e.number}`);
      const paid = e.paidAmount + dto.amount;
      const updated = await tx.expense.update({ where: { id }, data: { paidAmount: paid, status: paid >= e.amount ? 'PAID' : 'PARTIAL' } });
      await this.audit.log({ userId: user.id, action: 'PAYMENT', entity: 'Expense', entityId: id, summary: `Règlement ${formatFCFA(dto.amount)} sur ${e.number}`, ip }, tx);
      return updated;
    });
  }

  async cancelExpense(id: string, dto: CancelDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const e = await tx.expense.findUnique({ where: { id }, include: { payments: true } });
      if (!e) throw new NotFoundException('Dépense introuvable');
      if (e.status === 'CANCELLED') throw new BadRequestException('Déjà annulée');
      if (await tx.commissionPayout.findFirst({ where: { expenseId: id } })) throw new BadRequestException('Dépense liée à un règlement de commissions : non annulable');
      // Les espèces déjà sorties sont réintégrées dans la caisse ouverte
      const cashPaid = e.payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0);
      if (cashPaid > 0) await this.cash.record(tx, { type: 'IN', source: 'EXPENSE', amount: cashPaid, label: `Annulation dépense ${e.number}`, referenceId: id, userId: user.id });
      const updated = await tx.expense.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: user.id, cancelReason: dto.reason } });
      await this.audit.log({ userId: user.id, action: 'CANCEL', entity: 'Expense', entityId: id, summary: `Annulation dépense ${e.number} (${dto.reason})`, before: e, after: updated, ip }, tx);
      return updated;
    });
  }

  // ─────────── Autres recettes ───────────
  listIncomes(q: { from?: string; to?: string }) {
    const where: Prisma.OtherIncomeWhereInput = {};
    if (q.from || q.to) where.incomeDate = { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) };
    return this.prisma.otherIncome.findMany({ where, orderBy: [{ incomeDate: 'desc' }, { createdAt: 'desc' }], take: 1000 });
  }

  async createIncome(dto: CreateIncomeDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const number = await nextNumber(tx, 'REV');
      const inc = await tx.otherIncome.create({ data: { ...dto, number, incomeDate: new Date(dto.incomeDate), createdById: user.id } });
      if (dto.method === 'CASH') await this.cash.record(tx, { type: 'IN', source: 'OTHER_INCOME', amount: dto.amount, label: `Recette ${number} — ${dto.label}`, referenceId: inc.id, userId: user.id });
      await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'OtherIncome', entityId: inc.id, summary: `Autre recette ${number} : ${formatFCFA(dto.amount)} — ${dto.label}`, after: inc, ip }, tx);
      return inc;
    });
  }

  async cancelIncome(id: string, dto: CancelDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const inc = await tx.otherIncome.findUnique({ where: { id } });
      if (!inc) throw new NotFoundException('Recette introuvable');
      if (inc.cancelledAt) throw new BadRequestException('Déjà annulée');
      if (inc.method === 'CASH') await this.cash.record(tx, { type: 'OUT', source: 'OTHER_INCOME', amount: inc.amount, label: `Annulation recette ${inc.number}`, referenceId: id, userId: user.id });
      const updated = await tx.otherIncome.update({ where: { id }, data: { cancelledAt: new Date(), cancelledById: user.id, cancelReason: dto.reason } });
      await this.audit.log({ userId: user.id, action: 'CANCEL', entity: 'OtherIncome', entityId: id, summary: `Annulation recette ${inc.number} (${dto.reason})`, ip }, tx);
      return updated;
    });
  }

  // ─────────── États financiers ───────────

  /**
   * Compte de résultat simplifié de la période + encaissements/décaissements.
   * CA ≠ encaissements ; achats de stock ≠ charges ; bénéfice ≠ encaissements − décaissements.
   */
  async summary(p: Period) {
    const { from, to } = p;
    const [salesAgg, byType, retained, otherInc, cogs, stockLoss, expensesByCat, payIn, refunds, supplierOut, commissionsDue, commissionsPending, salesCount, cashDiff] = await Promise.all([
      this.prisma.sale.aggregate({ where: { status: 'VALIDATED', saleDate: { gte: from, lt: to } }, _sum: { total: true, discount: true, loyaltyDiscount: true, balance: true }, _count: true }),
      this.prisma.$queryRaw<{ type: string; amount: bigint }[]>`
        SELECT i."type"::text AS type, COALESCE(SUM(ROUND(i."total"::numeric * s."total" / NULLIF(s."subtotal", 0))), 0)::bigint AS amount
        FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
        WHERE s."status" = 'VALIDATED' AND s."saleDate" >= ${from} AND s."saleDate" < ${to}
        GROUP BY i."type"`,
      this.prisma.sale.aggregate({ where: { status: 'CANCELLED', saleDate: { gte: from, lt: to } }, _sum: { paidAmount: true, refundedAmount: true } }),
      this.prisma.otherIncome.aggregate({ where: { cancelledAt: null, incomeDate: { gte: from, lt: to } }, _sum: { amount: true } }),
      this.prisma.$queryRaw<{ v: bigint }[]>`
        SELECT COALESCE(SUM(i."quantity" * i."unitCost"), 0)::bigint AS v FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
        WHERE i."type" = 'PRODUCT' AND s."status" = 'VALIDATED' AND s."saleDate" >= ${from} AND s."saleDate" < ${to}`,
      this.prisma.$queryRaw<{ v: bigint }[]>`
        SELECT COALESCE(SUM(-m."quantity" * m."unitCost"), 0)::bigint AS v FROM "StockMovement" m
        WHERE m."type" IN ('USAGE', 'OUT', 'INVENTORY', 'ADJUSTMENT') AND m."createdAt" >= ${from} AND m."createdAt" < ${to}`,
      this.prisma.expense.groupBy({ by: ['categoryId'], where: { status: { not: 'CANCELLED' }, expenseDate: { gte: from, lt: to } }, _sum: { amount: true } }),
      this.prisma.payment.groupBy({ by: ['method'], where: { kind: { in: ['PAYMENT', 'DEPOSIT'] }, paidAt: { gte: from, lt: to } }, _sum: { amount: true } }),
      this.prisma.payment.groupBy({ by: ['method'], where: { kind: 'REFUND', paidAt: { gte: from, lt: to } }, _sum: { amount: true } }),
      this.prisma.supplierPayment.groupBy({ by: ['method'], where: { paidAt: { gte: from, lt: to } }, _sum: { amount: true } }),
      this.prisma.commission.aggregate({ where: { status: 'DUE', earnedAt: { gte: from, lt: to } }, _sum: { amount: true } }),
      this.prisma.commission.aggregate({ where: { status: 'PENDING', createdAt: { gte: from, lt: to } }, _sum: { amount: true } }),
      this.prisma.sale.count({ where: { saleDate: { gte: from, lt: to }, status: 'VALIDATED' } }),
      this.prisma.cashSession.aggregate({ where: { status: 'CLOSED', closedAt: { gte: from, lt: to } }, _sum: { difference: true } }),
    ]);
    const cats = await this.prisma.expenseCategory.findMany();
    const typeAmount = (t: string) => Number(byType.find((x) => x.type === t)?.amount ?? 0);
    const revenue = salesAgg._sum.total ?? 0;
    const services = typeAmount('SERVICE');
    const packages = typeAmount('PACKAGE');
    const products = revenue - services - packages; // complément exact (arrondis)
    const retainedDeposits = (retained._sum.paidAmount ?? 0) - (retained._sum.refundedAmount ?? 0);
    const otherIncome = otherInc._sum.amount ?? 0;
    const costOfGoodsSold = Number(cogs[0]?.v ?? 0);
    const stockConsumption = Number(stockLoss[0]?.v ?? 0);
    const expenses = expensesByCat.map((e) => {
      const c = cats.find((x) => x.id === e.categoryId);
      return { categoryId: e.categoryId, code: c?.code, name: c?.name ?? '?', account: c?.syscohadaAccount, amount: e._sum.amount ?? 0 };
    }).sort((a, b) => b.amount - a.amount);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const totalProducts = revenue + retainedDeposits + otherIncome;
    const accountingResult = totalProducts - costOfGoodsSold - stockConsumption - totalExpenses;
    const commissionsProvision = commissionsDue._sum.amount ?? 0;
    const encaissementsByMethod = METHODS.map((m) => ({
      method: m,
      amount: (payIn.find((x) => x.method === m)?._sum.amount ?? 0) - (refunds.find((x) => x.method === m)?._sum.amount ?? 0),
    }));
    const totalIn = encaissementsByMethod.reduce((s, x) => s + x.amount, 0) + otherIncome;
    const decaissementsByMethod = METHODS.map((m) => ({ method: m, amount: supplierOut.find((x) => x.method === m)?._sum.amount ?? 0 }));
    const totalOut = decaissementsByMethod.reduce((s, x) => s + x.amount, 0);
    return {
      period: p,
      revenue: { total: revenue, services, products, packages, discounts: (salesAgg._sum.discount ?? 0) + (salesAgg._sum.loyaltyDiscount ?? 0), salesCount, unpaidOnPeriodSales: salesAgg._sum.balance ?? 0 },
      retainedDeposits,
      otherIncome,
      costOfGoodsSold,
      stockConsumption,
      expenses,
      totalExpenses,
      accountingResult,
      commissionsProvision,
      commissionsPending: commissionsPending._sum.amount ?? 0,
      estimatedProfit: accountingResult - commissionsProvision,
      cash: { encaissementsByMethod, decaissementsByMethod, totalIn, totalOut, netCashFlow: totalIn - totalOut, cashDifferences: cashDiff._sum.difference ?? 0 },
    };
  }

  /** Trésorerie actuelle par moyen de paiement (soldes d'ouverture paramétrés + flux). */
  async treasury() {
    const t = await this.settings.get('treasury');
    const since = t.openingDate ? new Date(t.openingDate) : new Date('2000-01-01');
    const [payIn, refunds, incomes, supplierOut, manual, diffs] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['method'], where: { kind: { in: ['PAYMENT', 'DEPOSIT'] }, paidAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.payment.groupBy({ by: ['method'], where: { kind: 'REFUND', paidAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.otherIncome.groupBy({ by: ['method'], where: { cancelledAt: null, incomeDate: { gte: since } }, _sum: { amount: true } }),
      this.prisma.supplierPayment.groupBy({ by: ['method'], where: { paidAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.cashMovement.groupBy({ by: ['type'], where: { source: 'MANUAL', createdAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.cashSession.aggregate({ where: { status: 'CLOSED', closedAt: { gte: since } }, _sum: { difference: true } }),
    ]);
    // Annulations de dépenses payées en espèces (réintégration) : mouvements IN de source EXPENSE.
    // (Les recettes annulées sont simplement exclues : leur sortie de caisse n'est pas recomptée.)
    const expenseReversal = await this.prisma.cashMovement.aggregate({ where: { source: 'EXPENSE', type: 'IN', createdAt: { gte: since } }, _sum: { amount: true } });
    const g = (arr: { method: PaymentMethod; _sum: { amount: number | null } }[], m: PaymentMethod) => arr.find((x) => x.method === m)?._sum.amount ?? 0;
    const accounts = METHODS.map((m) => {
      let balance = (t.openingBalances[m] ?? 0) + g(payIn, m) - g(refunds, m) + g(incomes, m) - g(supplierOut, m);
      if (m === 'CASH') {
        balance += (manual.find((x) => x.type === 'IN')?._sum.amount ?? 0) - (manual.find((x) => x.type === 'OUT')?._sum.amount ?? 0);
        balance += diffs._sum.difference ?? 0;
        balance += expenseReversal._sum.amount ?? 0;
      }
      return { method: m, opening: t.openingBalances[m] ?? 0, balance };
    });
    return { since: t.openingDate, accounts, total: accounts.reduce((s, a) => s + a.balance, 0) };
  }

  /** Créances clients : ventes validées non soldées. */
  async receivables() {
    const sales = await this.prisma.sale.findMany({ where: { status: 'VALIDATED', balance: { gt: 0 } }, orderBy: { saleDate: 'asc' }, include: { client: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } } } });
    return { items: sales, total: sales.reduce((s, x) => s + x.balance, 0) };
  }

  /** Dettes fournisseurs : achats et dépenses non soldés. */
  async payables() {
    const [purchases, expenses] = await Promise.all([
      this.prisma.purchase.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] } }, include: { supplier: { select: { name: true } } }, orderBy: { purchaseDate: 'asc' } }),
      this.prisma.expense.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] } }, include: { supplier: { select: { name: true } }, category: { select: { name: true } } }, orderBy: { expenseDate: 'asc' } }),
    ]);
    const items = [
      ...purchases.map((p) => ({ kind: 'PURCHASE', id: p.id, number: p.number, date: p.purchaseDate, supplier: p.supplier.name, label: `Achat de marchandises${p.reference ? ` (fact. ${p.reference})` : ''}`, amount: p.total, paid: p.paidAmount, balance: p.total - p.paidAmount })),
      ...expenses.map((e) => ({ kind: 'EXPENSE', id: e.id, number: e.number, date: e.expenseDate, supplier: e.supplier?.name ?? '—', label: `${e.category.name} — ${e.label}`, amount: e.amount, paid: e.paidAmount, balance: e.amount - e.paidAmount })),
    ].sort((a, b) => +a.date - +b.date);
    return { items, total: items.reduce((s, x) => s + x.balance, 0) };
  }

  /** Journal des recettes : encaissements, acomptes, remboursements et autres recettes. */
  async incomeJournal(p: Period) {
    const [payments, incomes] = await Promise.all([
      this.prisma.payment.findMany({ where: { paidAt: { gte: p.from, lt: p.to } }, orderBy: { paidAt: 'asc' }, include: { sale: { select: { number: true, client: { select: { firstName: true, lastName: true } } } } } }),
      this.prisma.otherIncome.findMany({ where: { incomeDate: { gte: p.from, lt: p.to }, cancelledAt: null }, orderBy: { incomeDate: 'asc' } }),
    ]);
    const rows = [
      ...payments.map((x) => ({ date: x.paidAt, number: x.number, nature: x.kind === 'REFUND' ? 'Remboursement' : x.kind === 'DEPOSIT' ? 'Acompte' : 'Encaissement vente', label: `${x.sale.number}${x.sale.client ? ` — ${x.sale.client.firstName} ${x.sale.client.lastName}` : ''}`, method: x.method, reference: x.reference, amount: x.kind === 'REFUND' ? -x.amount : x.amount })),
      ...incomes.map((x) => ({ date: x.incomeDate, number: x.number, nature: `Autre recette (${x.category})`, label: x.label, method: x.method, reference: x.reference, amount: x.amount })),
    ].sort((a, b) => +a.date - +b.date);
    return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
  }
}
