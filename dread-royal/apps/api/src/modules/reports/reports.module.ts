import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { APPOINTMENT_STATUS_LABELS, CASH_SOURCE_LABELS, COMMISSION_STATUS_LABELS, EXPENSE_STATUS_LABELS, GENDER_LABELS, hasAnyPermission, hasPermission, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, STOCK_MOVEMENT_LABELS, formatFCFA } from '@dread-royal/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { addDays, fmt, Period, resolvePeriod } from '../../common/period';
import { FinanceModule } from '../finance/finance.module';
import { FinanceService } from '../finance/finance.service';
import { formatCell, PdfService, ReportData } from '../documents/pdf.service';

interface ReportQuery { period?: string; date?: string; from?: string; to?: string; format?: string; staffId?: string; access_token?: string }

export const REPORTS: Record<string, { title: string; permissions: string[]; periodic: boolean }> = {
  sales: { title: 'Rapport des ventes', permissions: ['sales.view'], periodic: true },
  payments: { title: 'Journal des recettes (encaissements)', permissions: ['finance.view'], periodic: true },
  expenses: { title: 'Journal des dépenses', permissions: ['expenses.view'], periodic: true },
  cash: { title: 'État de caisse (sessions)', permissions: ['cash.manage', 'finance.view'], periodic: true },
  result: { title: 'Compte de résultat simplifié', permissions: ['finance.view'], periodic: true },
  services: { title: 'Prestations réalisées', permissions: ['sales.view', 'finance.view'], periodic: true },
  commissions: { title: 'Commissions du personnel', permissions: ['commissions.view_all'], periodic: true },
  stock: { title: 'État du stock', permissions: ['stock.view'], periodic: false },
  'stock-movements': { title: 'Mouvements de stock', permissions: ['stock.view'], periodic: true },
  attendance: { title: 'Fréquentation du salon', permissions: ['dashboard.view', 'appointments.view_all'], periodic: true },
  receivables: { title: 'Créances clients (reste à payer)', permissions: ['finance.view', 'sales.view'], periodic: false },
  payables: { title: 'Dettes fournisseurs', permissions: ['finance.view'], periodic: false },
  clients: { title: 'Fichier clients', permissions: ['clients.view'], periodic: false },
};

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private finance: FinanceService, private pdf: PdfService) {}

  async build(type: string, q: ReportQuery, user: AuthUser): Promise<ReportData> {
    const def = REPORTS[type];
    if (!def) throw new BadRequestException('Rapport inconnu');
    if (!hasAnyPermission(user.permissions, def.permissions)) throw new ForbiddenException("Vous n'avez pas accès à ce rapport");
    const p: Period = resolvePeriod({ period: q.period ?? 'month', date: q.date, from: q.from, to: q.to });
    const subtitle = def.periodic ? `Période : ${p.label} (du ${fmt(p.from)} au ${fmt(addDays(p.to, -1))})` : `Situation au ${fmt(new Date())}`;
    const base = { title: def.title, subtitle };
    switch (type) {
      case 'sales': {
        const sales = await this.prisma.sale.findMany({ where: { saleDate: { gte: p.from, lt: p.to }, ...(q.staffId ? { items: { some: { staffId: q.staffId } } } : {}) }, orderBy: { saleDate: 'asc' }, include: { client: true } });
        const rows = sales.map((s) => ({ date: s.saleDate, number: s.number, client: s.client ? `${s.client.firstName} ${s.client.lastName}` : 'Passage', subtotal: s.subtotal, discount: s.discount + s.loyaltyDiscount, total: s.status === 'CANCELLED' ? 0 : s.total, paid: s.paidAmount - s.refundedAmount, balance: s.status === 'CANCELLED' ? 0 : s.balance, status: s.status === 'CANCELLED' ? `Annulée (${s.cancelReason})` : PAYMENT_STATUS_LABELS[s.paymentStatus] }));
        const sum = (k: string) => rows.reduce((a, r) => a + Number((r as any)[k]), 0);
        return { ...base, columns: [{ key: 'date', label: 'Date', type: 'datetime' }, { key: 'number', label: 'Facture' }, { key: 'client', label: 'Client', width: 2 }, { key: 'subtotal', label: 'Brut', type: 'money' }, { key: 'discount', label: 'Remises', type: 'money' }, { key: 'total', label: 'Total net', type: 'money' }, { key: 'paid', label: 'Payé', type: 'money' }, { key: 'balance', label: 'Reste', type: 'money' }, { key: 'status', label: 'Statut', width: 1.6 }],
          rows, totals: { client: `${rows.length} ventes`, subtotal: sum('subtotal'), discount: sum('discount'), total: sum('total'), paid: sum('paid'), balance: sum('balance') },
          summary: [{ label: "Chiffre d'affaires", value: formatFCFA(sum('total')) }, { label: 'Encaissé sur ces ventes', value: formatFCFA(sum('paid')) }, { label: 'Reste à payer', value: formatFCFA(sum('balance')) }, { label: 'Ventes annulées', value: String(sales.filter((s) => s.status === 'CANCELLED').length) }] };
      }
      case 'payments': {
        const j = await this.finance.incomeJournal(p);
        const byMethod = Object.keys(PAYMENT_METHOD_LABELS).map((m) => ({ label: PAYMENT_METHOD_LABELS[m], value: formatFCFA(j.rows.filter((r) => r.method === m).reduce((a, r) => a + r.amount, 0)) }));
        return { ...base, columns: [{ key: 'date', label: 'Date', type: 'datetime' }, { key: 'number', label: 'N° pièce' }, { key: 'nature', label: 'Nature', width: 1.5 }, { key: 'label', label: 'Libellé', width: 2.5 }, { key: 'method', label: 'Moyen' }, { key: 'reference', label: 'Référence' }, { key: 'amount', label: 'Montant', type: 'money' }],
          rows: j.rows.map((r) => ({ ...r, method: PAYMENT_METHOD_LABELS[r.method] })), totals: { label: `${j.rows.length} opérations`, amount: j.total }, summary: [{ label: 'Total encaissé (net)', value: formatFCFA(j.total) }, ...byMethod] };
      }
      case 'expenses': {
        const list = await this.prisma.expense.findMany({ where: { expenseDate: { gte: p.from, lt: p.to } }, orderBy: { expenseDate: 'asc' }, include: { category: true, supplier: true } });
        const rows = list.map((e) => ({ date: e.expenseDate, number: e.number, category: e.category.name, account: e.category.syscohadaAccount, label: e.label, supplier: e.supplier?.name ?? '', amount: e.status === 'CANCELLED' ? 0 : e.amount, paid: e.status === 'CANCELLED' ? 0 : e.paidAmount, status: e.status === 'CANCELLED' ? `Annulée (${e.cancelReason})` : EXPENSE_STATUS_LABELS[e.status] }));
        const total = rows.reduce((a, r) => a + r.amount, 0);
        const byCat = new Map<string, number>();
        rows.forEach((r) => byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount));
        return { ...base, columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'number', label: 'N°' }, { key: 'category', label: 'Catégorie' }, { key: 'account', label: 'Compte' }, { key: 'label', label: 'Libellé', width: 2.2 }, { key: 'supplier', label: 'Fournisseur' }, { key: 'amount', label: 'Montant', type: 'money' }, { key: 'paid', label: 'Payé', type: 'money' }, { key: 'status', label: 'Statut' }],
          rows, totals: { label: `${rows.length} dépenses`, amount: total, paid: rows.reduce((a, r) => a + r.paid, 0) },
          summary: [{ label: 'Total des charges', value: formatFCFA(total) }, ...[...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => ({ label: k, value: formatFCFA(v) }))] };
      }
      case 'cash': {
        const sessions = await this.prisma.cashSession.findMany({ where: { openedAt: { gte: p.from, lt: p.to } }, orderBy: { openedAt: 'asc' }, include: { movements: true } });
        const rows = sessions.map((s) => {
          const inn = s.movements.filter((m) => m.type === 'IN').reduce((a, m) => a + m.amount, 0);
          const out = s.movements.filter((m) => m.type === 'OUT').reduce((a, m) => a + m.amount, 0);
          return { number: s.number, openedAt: s.openedAt, closedAt: s.closedAt, opening: s.openingAmount, in: inn, out, theoretical: s.openingAmount + inn - out, counted: s.countedAmount, difference: s.difference, reason: s.differenceReason ?? (s.status === 'OPEN' ? 'Session ouverte' : '') };
        });
        return { ...base, columns: [{ key: 'number', label: 'Session' }, { key: 'openedAt', label: 'Ouverture', type: 'datetime' }, { key: 'closedAt', label: 'Clôture', type: 'datetime' }, { key: 'opening', label: 'Fonds initial', type: 'money' }, { key: 'in', label: 'Entrées', type: 'money' }, { key: 'out', label: 'Sorties', type: 'money' }, { key: 'theoretical', label: 'Solde théorique', type: 'money' }, { key: 'counted', label: 'Solde réel', type: 'money' }, { key: 'difference', label: 'Écart', type: 'money' }, { key: 'reason', label: 'Justification', width: 2 }],
          rows, totals: { number: 'TOTAL', in: rows.reduce((a, r) => a + r.in, 0), out: rows.reduce((a, r) => a + r.out, 0), difference: rows.reduce((a, r) => a + (r.difference ?? 0), 0) } };
      }
      case 'result': {
        const s = await this.finance.summary(p);
        const rows: { label: string; account?: string; amount: number }[] = [
          { label: "Chiffre d'affaires — prestations", account: '706', amount: s.revenue.services },
          { label: "Chiffre d'affaires — ventes de produits", account: '701', amount: s.revenue.products },
          { label: "Chiffre d'affaires — forfaits", account: '706', amount: s.revenue.packages },
          { label: 'Acomptes conservés sur ventes annulées', account: '758', amount: s.retainedDeposits },
          { label: 'Autres recettes', account: '75', amount: s.otherIncome },
          { label: 'TOTAL DES PRODUITS', amount: s.revenue.total + s.retainedDeposits + s.otherIncome },
          { label: 'Coût d’achat des produits vendus', account: '601', amount: -s.costOfGoodsSold },
          { label: 'Consommations, pertes et écarts de stock', account: '603', amount: -s.stockConsumption },
          ...s.expenses.map((e) => ({ label: `Charges — ${e.name}`, account: e.account ?? undefined, amount: -e.amount })),
          { label: 'RÉSULTAT COMPTABLE (estimation)', amount: s.accountingResult },
          { label: 'Commissions dues non encore réglées (provision)', account: '4286', amount: -s.commissionsProvision },
          { label: 'BÉNÉFICE ESTIMÉ', amount: s.estimatedProfit },
        ];
        return { ...base, subtitle: `${subtitle} — Présentation indicative, à valider par un professionnel comptable (SYSCOHADA)`, columns: [{ key: 'label', label: 'Poste', width: 4 }, { key: 'account', label: 'Compte SYSCOHADA' }, { key: 'amount', label: 'Montant', type: 'money' }], rows,
          summary: [{ label: "Chiffre d'affaires", value: formatFCFA(s.revenue.total) }, { label: 'Encaissements (trésorerie)', value: formatFCFA(s.cash.totalIn) }, { label: 'Décaissements (trésorerie)', value: formatFCFA(s.cash.totalOut) }, { label: 'Résultat comptable', value: formatFCFA(s.accountingResult) }] };
      }
      case 'services': {
        const rows = await this.prisma.$queryRaw<{ code: string; name: string; category: string; count: bigint; amount: bigint }[]>`
          SELECT sv."code", sv."name", c."name" AS category, SUM(i."quantity")::bigint AS count, SUM(i."total")::bigint AS amount
          FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId" JOIN "Service" sv ON sv."id" = i."serviceId" JOIN "ServiceCategory" c ON c."id" = sv."categoryId"
          WHERE i."type" = 'SERVICE' AND s."status" = 'VALIDATED' AND s."saleDate" >= ${p.from} AND s."saleDate" < ${p.to}
          GROUP BY sv."code", sv."name", c."name" ORDER BY count DESC`;
        const r = rows.map((x) => ({ code: x.code, name: x.name, category: x.category, count: Number(x.count), amount: Number(x.amount), avg: Math.round(Number(x.amount) / Math.max(1, Number(x.count))) }));
        return { ...base, columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Prestation', width: 2.5 }, { key: 'category', label: 'Catégorie', width: 1.6 }, { key: 'count', label: 'Nombre', type: 'int' }, { key: 'amount', label: 'Montant', type: 'money' }, { key: 'avg', label: 'Prix moyen', type: 'money' }],
          rows: r, totals: { code: 'TOTAL', count: r.reduce((a, x) => a + x.count, 0), amount: r.reduce((a, x) => a + x.amount, 0) } };
      }
      case 'commissions': {
        const list = await this.prisma.commission.findMany({ where: { createdAt: { gte: p.from, lt: p.to }, ...(q.staffId ? { staffId: q.staffId } : {}) }, orderBy: { createdAt: 'asc' }, include: { staff: true, saleItem: { include: { sale: true } } } });
        const rows = list.map((c) => ({ date: c.createdAt, staff: `${c.staff.firstName} ${c.staff.lastName}`, sale: c.saleItem.sale.number, service: c.saleItem.label, base: c.baseAmount, rule: c.rule, amount: c.amount, status: COMMISSION_STATUS_LABELS[c.status] }));
        const by = (st: string) => list.filter((c) => c.status === st).reduce((a, c) => a + c.amount, 0);
        return { ...base, columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'staff', label: 'Collaborateur', width: 1.5 }, { key: 'sale', label: 'Facture' }, { key: 'service', label: 'Prestation', width: 2.2 }, { key: 'base', label: 'Base', type: 'money' }, { key: 'rule', label: 'Règle' }, { key: 'amount', label: 'Commission', type: 'money' }, { key: 'status', label: 'Statut', width: 1.4 }],
          rows, totals: { staff: `${rows.length} lignes`, amount: rows.filter((r) => r.status !== 'Annulée').reduce((a, r) => a + r.amount, 0) },
          summary: [{ label: 'Dues', value: formatFCFA(by('DUE')) }, { label: 'Réglées', value: formatFCFA(by('PAID')) }, { label: 'En attente (vente non soldée)', value: formatFCFA(by('PENDING')) }] };
      }
      case 'stock': {
        const products = await this.prisma.product.findMany({ where: { active: true }, include: { category: true, supplier: true }, orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }] });
        const rows = products.map((x) => ({ reference: x.reference, name: x.name, category: x.category.name, quantity: x.quantity, min: x.minQuantity, cost: x.purchasePrice, price: x.salePrice, value: x.quantity * x.purchasePrice, alert: x.quantity <= x.minQuantity ? 'À commander' : '' }));
        return { ...base, columns: [{ key: 'reference', label: 'Réf.' }, { key: 'name', label: 'Produit', width: 2.4 }, { key: 'category', label: 'Catégorie', width: 1.4 }, { key: 'quantity', label: 'Qté', type: 'int' }, { key: 'min', label: 'Seuil', type: 'int' }, { key: 'cost', label: 'Coût (CMUP)', type: 'money' }, { key: 'price', label: 'Prix vente', type: 'money' }, { key: 'value', label: 'Valeur stock', type: 'money' }, { key: 'alert', label: 'Alerte' }],
          rows, totals: { reference: 'TOTAL', quantity: rows.reduce((a, r) => a + r.quantity, 0), value: rows.reduce((a, r) => a + r.value, 0) },
          summary: [{ label: 'Valeur du stock (coût)', value: formatFCFA(rows.reduce((a, r) => a + r.value, 0)) }, { label: 'Produits en alerte', value: String(rows.filter((r) => r.alert).length) }] };
      }
      case 'stock-movements': {
        const list = await this.prisma.stockMovement.findMany({ where: { createdAt: { gte: p.from, lt: p.to } }, orderBy: { createdAt: 'asc' }, include: { product: true } });
        return { ...base, columns: [{ key: 'date', label: 'Date', type: 'datetime' }, { key: 'product', label: 'Produit', width: 2.2 }, { key: 'type', label: 'Type', width: 1.4 }, { key: 'quantity', label: 'Qté', type: 'int' }, { key: 'before', label: 'Avant', type: 'int' }, { key: 'after', label: 'Après', type: 'int' }, { key: 'value', label: 'Valeur', type: 'money' }, { key: 'reason', label: 'Motif', width: 2 }],
          rows: list.map((m) => ({ date: m.createdAt, product: `${m.product.reference} ${m.product.name}`, type: STOCK_MOVEMENT_LABELS[m.type], quantity: m.quantity, before: m.quantityBefore, after: m.quantityAfter, value: m.quantity * m.unitCost, reason: m.reason })) };
      }
      case 'attendance': {
        const rows = await this.prisma.$queryRaw<{ day: Date; clients: bigint; sales: bigint; services: bigint; appts: bigint; noshow: bigint; newclients: bigint }[]>`
          WITH days AS (SELECT generate_series(${p.from}::timestamp, ${addDays(p.to, -1)}::timestamp, interval '1 day') AS day)
          SELECT d.day,
            (SELECT COUNT(DISTINCT s."clientId") FROM "Sale" s WHERE s."status"='VALIDATED' AND s."saleDate" >= d.day AND s."saleDate" < d.day + interval '1 day')::bigint AS clients,
            (SELECT COUNT(*) FROM "Sale" s WHERE s."status"='VALIDATED' AND s."saleDate" >= d.day AND s."saleDate" < d.day + interval '1 day')::bigint AS sales,
            (SELECT COALESCE(SUM(i."quantity"),0) FROM "SaleItem" i JOIN "Sale" s ON s."id"=i."saleId" WHERE i."type"='SERVICE' AND s."status"='VALIDATED' AND s."saleDate" >= d.day AND s."saleDate" < d.day + interval '1 day')::bigint AS services,
            (SELECT COUNT(*) FROM "Appointment" a WHERE a."startAt" >= d.day AND a."startAt" < d.day + interval '1 day')::bigint AS appts,
            (SELECT COUNT(*) FROM "Appointment" a WHERE a."status"='NO_SHOW' AND a."startAt" >= d.day AND a."startAt" < d.day + interval '1 day')::bigint AS noshow,
            (SELECT COUNT(*) FROM "Client" c WHERE c."createdAt" >= d.day AND c."createdAt" < d.day + interval '1 day')::bigint AS newclients
          FROM days d ORDER BY d.day`;
        const r = rows.map((x) => ({ day: x.day, weekday: new Date(x.day).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' }), clients: Number(x.clients), sales: Number(x.sales), services: Number(x.services), appts: Number(x.appts), noshow: Number(x.noshow), newclients: Number(x.newclients) }));
        const s = (k: keyof (typeof r)[0]) => r.reduce((a, x) => a + Number(x[k]), 0);
        return { ...base, columns: [{ key: 'day', label: 'Date', type: 'date' }, { key: 'weekday', label: 'Jour' }, { key: 'clients', label: 'Clients servis', type: 'int' }, { key: 'sales', label: 'Ventes', type: 'int' }, { key: 'services', label: 'Prestations', type: 'int' }, { key: 'appts', label: 'RDV', type: 'int' }, { key: 'noshow', label: 'Absents', type: 'int' }, { key: 'newclients', label: 'Nouveaux clients', type: 'int' }],
          rows: r, totals: { day: 'TOTAL', clients: s('clients'), sales: s('sales'), services: s('services'), appts: s('appts'), noshow: s('noshow'), newclients: s('newclients') } };
      }
      case 'receivables': {
        const rec = await this.finance.receivables();
        return { ...base, columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'number', label: 'Facture' }, { key: 'client', label: 'Client', width: 2 }, { key: 'phone', label: 'Téléphone' }, { key: 'total', label: 'Total', type: 'money' }, { key: 'paid', label: 'Payé', type: 'money' }, { key: 'balance', label: 'Reste dû', type: 'money' }],
          rows: rec.items.map((s) => ({ date: s.saleDate, number: s.number, client: s.client ? `${s.client.firstName} ${s.client.lastName}` : 'Passage', phone: s.client?.phone, total: s.total, paid: s.paidAmount, balance: s.balance })), totals: { number: 'TOTAL', balance: rec.total } };
      }
      case 'payables': {
        const pay = await this.finance.payables();
        return { ...base, columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'number', label: 'N°' }, { key: 'supplier', label: 'Fournisseur', width: 1.6 }, { key: 'label', label: 'Objet', width: 2.4 }, { key: 'amount', label: 'Montant', type: 'money' }, { key: 'paid', label: 'Payé', type: 'money' }, { key: 'balance', label: 'Reste dû', type: 'money' }],
          rows: pay.items, totals: { number: 'TOTAL', balance: pay.total } };
      }
      case 'clients': {
        const clients = await this.prisma.client.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }], include: { sales: { where: { status: 'VALIDATED' }, select: { total: true, balance: true, saleDate: true } } } });
        return { ...base, columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Nom et prénom', width: 2 }, { key: 'phone', label: 'Téléphone' }, { key: 'gender', label: 'Sexe' }, { key: 'createdAt', label: 'Inscription', type: 'date' }, { key: 'visits', label: 'Achats', type: 'int' }, { key: 'spent', label: 'CA cumulé', type: 'money' }, { key: 'debt', label: 'Reste dû', type: 'money' }, { key: 'points', label: 'Points', type: 'int' }],
          rows: clients.map((c) => ({ code: c.code, name: `${c.lastName} ${c.firstName}`, phone: c.phone, gender: GENDER_LABELS[c.gender], createdAt: c.createdAt, visits: c.sales.length, spent: c.sales.reduce((a, s) => a + s.total, 0), debt: c.sales.reduce((a, s) => a + s.balance, 0), points: c.loyaltyPoints })) };
      }
    }
    throw new BadRequestException('Rapport inconnu');
  }

  toCsv(r: ReportData): Buffer {
    const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const cell = (v: unknown, t?: string) => (t === 'money' || t === 'int' ? (v == null ? '' : String(v)) : formatCell(v, t as any));
    const lines = [r.columns.map((c) => esc(c.label + (c.type === 'money' ? ' (FCFA)' : ''))).join(';')];
    for (const row of r.rows) lines.push(r.columns.map((c) => esc(cell(row[c.key], c.type))).join(';'));
    if (r.totals) lines.push(r.columns.map((c, i) => esc(i === 0 && r.totals![c.key] === undefined ? 'TOTAL' : cell(r.totals![c.key], c.type))).join(';'));
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
  }

  async toXlsx(r: ReportData): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DREAD ROYAL MANAGEMENT SYSTEM';
    const ws = wb.addWorksheet(r.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    ws.addRow([r.title]).font = { bold: true, size: 14 };
    if (r.subtitle) ws.addRow([r.subtitle]).font = { italic: true, color: { argb: 'FF6B7280' } };
    ws.addRow([]);
    const head = ws.addRow(r.columns.map((c) => c.label + (c.type === 'money' ? ' (FCFA)' : '')));
    head.eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFD4AF37' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B0B0B' } }; });
    const val = (v: unknown, t?: string) => {
      if (v === null || v === undefined) return null;
      if (t === 'money' || t === 'int') return Number(v);
      if (t === 'date' || t === 'datetime') return new Date(v as string);
      return String(v);
    };
    for (const row of r.rows) ws.addRow(r.columns.map((c) => val(row[c.key], c.type)));
    if (r.totals) {
      const tr = ws.addRow(r.columns.map((c, i) => (i === 0 && r.totals![c.key] === undefined ? 'TOTAL' : val(r.totals![c.key], c.type))));
      tr.font = { bold: true };
      tr.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E7C3' } }));
    }
    r.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.type === 'money' ? 16 : c.type === 'int' ? 10 : c.type === 'datetime' ? 18 : c.type === 'date' ? 12 : Math.min(45, 14 * (c.width ?? 1.3));
      if (c.type === 'money') col.numFmt = '#,##0';
      if (c.type === 'date') col.numFmt = 'dd/mm/yyyy';
      if (c.type === 'datetime') col.numFmt = 'dd/mm/yyyy hh:mm';
    });
    if (r.summary?.length) {
      const s = wb.addWorksheet('Synthèse');
      s.addRow(['Indicateur', 'Valeur']).font = { bold: true };
      r.summary.forEach((x) => s.addRow([x.label, x.value]));
      s.getColumn(1).width = 40; s.getColumn(2).width = 22;
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private s: ReportsService, private pdf: PdfService) {}

  @Get() @RequirePermissions('reports.view')
  catalog(@CurrentUser() u: AuthUser) {
    return Object.entries(REPORTS).filter(([, d]) => hasAnyPermission(u.permissions, d.permissions)).map(([key, d]) => ({ key, title: d.title, periodic: d.periodic }));
  }

  @Get(':type') @RequirePermissions('reports.view')
  async get(@Param('type') type: string, @Query() q: ReportQuery, @CurrentUser() u: AuthUser, @Res() res: Response) {
    const data = await this.s.build(type, q, u);
    const name = `${type}-${new Date().toISOString().slice(0, 10)}`;
    const format = q.format ?? 'json';
    res.setHeader('Cache-Control', 'no-store');
    if (format === 'json') return res.json(data);
    if (format === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`); return res.end(this.s.toCsv(data)); }
    if (format === 'xlsx') { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`); return res.end(await this.s.toXlsx(data)); }
    if (format === 'pdf') { res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${name}.pdf"`); return res.end(await this.pdf.report(data)); }
    throw new BadRequestException('Format : json, csv, xlsx ou pdf');
  }
}

@Module({ imports: [FinanceModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
