/**
 * DONNÉES DE DÉMONSTRATION — à n'utiliser QUE sur une base de test / formation.
 * Simule ~45 jours d'activité en passant par les vrais services métier (calculs, stock,
 * commissions, caisse et fidélité cohérents). Refuse de s'exécuter si la base contient déjà des ventes.
 * Usage : npm run seed:demo   (après npm run seed)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthUser } from '../src/common/auth-user';
import { ClientsService } from '../src/modules/clients/clients.module';
import { AppointmentsService } from '../src/modules/appointments/appointments.module';
import { SalesService } from '../src/modules/sales/sales.service';
import { FinanceService } from '../src/modules/finance/finance.service';
import { hashPassword } from '../src/modules/auth/auth.module';
import { nextCode, nextNumber } from '../src/common/numbering';
import { StockEngine, CashEngine } from '../src/modules/core/engines';

const DAYS = Number(process.env.DEMO_DAYS ?? 45);
let seed = 20260101;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const round = (n: number, step = 500) => Math.round(n / step) * step;

const FIRST_M = ['Issouf', 'Boukary', 'Salif', 'Adama', 'Moussa', 'Ousmane', 'Arouna', 'Hamidou', 'Rasmané', 'Souleymane', 'Abdoul Karim', 'Yacouba', 'Lassané', 'Inoussa', 'Mahamadi', 'Wendpouiré', 'Cédric', 'Jean-Baptiste'];
const FIRST_F = ['Mariam', 'Aminata', 'Fatimata', 'Awa', 'Salimata', 'Rasmata', 'Alimata', 'Adjaratou', 'Bintou', 'Clarisse', 'Nafissatou', 'Pélagie', 'Habibou', 'Assita', 'Djénéba', 'Wendkouni', 'Estelle', 'Ramatou'];
const LAST = ['OUÉDRAOGO', 'SAWADOGO', 'KABORÉ', 'COMPAORÉ', 'TRAORÉ', 'ZONGO', 'ILBOUDO', 'NIKIÉMA', 'KONÉ', 'ZOUNGRANA', 'TIENDRÉBÉOGO', 'BAMOGO', 'YAMÉOGO', 'KINDA', 'OUATTARA', 'DIALLO', 'SANOU', 'SOME', 'BAGRÉ', 'CONGO'];

const PRODUCTS = [
  { reference: 'SHP-LOCK-500', name: 'Shampoing clarifiant spécial locks 500 ml', cat: 'SHAMPOING', buy: 2500, sell: 4000, min: 4, qty: 18 },
  { reference: 'SHP-KARITE', name: 'Shampoing au karité 250 ml (Burkina)', cat: 'SHAMPOING', buy: 1200, sell: 2000, min: 6, qty: 24 },
  { reference: 'HUI-KARITE', name: 'Beurre de karité pur 250 g', cat: 'HUILE', buy: 1000, sell: 2000, min: 8, qty: 30 },
  { reference: 'HUI-RICIN', name: 'Huile de ricin noire 120 ml', cat: 'HUILE', buy: 3500, sell: 5500, min: 4, qty: 12 },
  { reference: 'HUI-COCO', name: 'Huile de coco vierge 250 ml', cat: 'HUILE', buy: 1500, sell: 2500, min: 5, qty: 15 },
  { reference: 'GEL-LOCK', name: 'Gel locks Lock & Twist 250 ml', cat: 'GEL', buy: 3000, sell: 4500, min: 4, qty: 14 },
  { reference: 'GEL-ALOE', name: "Gel d'aloe vera coiffant 300 ml", cat: 'GEL', buy: 1500, sell: 2500, min: 4, qty: 10 },
  { reference: 'CIRE-LOCK', name: 'Cire naturelle pour locks 100 g', cat: 'CIRE', buy: 3500, sell: 5000, min: 3, qty: 10 },
  { reference: 'SPR-LOCK', name: 'Spray hydratant locks 250 ml', cat: 'LOCKS', buy: 2500, sell: 4000, min: 4, qty: 12 },
  { reference: 'CRO-05', name: 'Crochet à locks 0,5 mm', cat: 'LOCKS', buy: 1000, sell: 2000, min: 3, qty: 8 },
  { reference: 'BAG-OR-10', name: 'Bagues dorées pour locks (lot de 10)', cat: 'ACCESSOIRE', buy: 750, sell: 1500, min: 10, qty: 40 },
  { reference: 'PERLE-CAURI', name: 'Perles cauris pour tresses (lot de 20)', cat: 'ACCESSOIRE', buy: 500, sell: 1000, min: 10, qty: 35 },
  { reference: 'BONNET-SAT', name: 'Bonnet de nuit en satin', cat: 'ACCESSOIRE', buy: 1000, sell: 2000, min: 5, qty: 15 },
  { reference: 'PEI-AFRO', name: 'Peigne afro en bois', cat: 'PEIGNE', buy: 500, sell: 1000, min: 5, qty: 20 },
  { reference: 'PEI-QUEUE', name: 'Peigne queue de rat', cat: 'PEIGNE', buy: 250, sell: 500, min: 10, qty: 30 },
  { reference: 'BRO-SANG', name: 'Brosse poils de sanglier (barbier)', cat: 'BROSSE', buy: 2000, sell: 3500, min: 3, qty: 6 },
  { reference: 'MECHE-XP', name: 'Mèches X-pression (paquet)', cat: 'MECHE', buy: 1000, sell: 1500, min: 15, qty: 60 },
  { reference: 'MECHE-LOCS', name: 'Mèches faux locs crochet (paquet)', cat: 'MECHE', buy: 2000, sell: 3000, min: 10, qty: 30 },
  { reference: 'FOU-GANTS', name: 'Gants jetables (boîte de 100)', cat: 'FOURNITURE', buy: 3500, sell: 0, min: 2, qty: 5, internal: true },
  { reference: 'FOU-SERV', name: 'Serviettes jetables (paquet de 50)', cat: 'FOURNITURE', buy: 2500, sell: 0, min: 2, qty: 4, internal: true },
];

async function main() {
  process.env.BACKUP_CRON = 'off';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);
  if ((await prisma.sale.count()) > 0 && !process.argv.includes('--force')) {
    throw new Error('La base contient déjà des ventes : démonstration refusée (protection des données réelles).');
  }
  const clientsSvc = app.get(ClientsService);
  const apptSvc = app.get(AppointmentsService);
  const salesSvc = app.get(SalesService);
  const finance = app.get(FinanceService);
  const stock = app.get(StockEngine);
  const cash = app.get(CashEngine);

  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.code, r]));
  const owner = await prisma.user.findFirstOrThrow({ where: { role: { code: 'OWNER' } } });
  const asUser = (u: { id: string; username: string; fullName: string }, code: string, staffId: string | null = null): AuthUser => ({ id: u.id, username: u.username, fullName: u.fullName, roleCode: code, roleName: roles[code].name, permissions: roles[code].permissions, staffId, sessionId: 'demo' });
  const ownerU = asUser(owner, 'OWNER');

  // ─── Personnel et comptes ───
  const STAFF = [
    { firstName: 'Abdoul Aziz', lastName: 'OUÉDRAOGO', position: 'Locticien principal', contractType: 'CDI', baseSalary: 75000, commissionMode: 'SERVICE_DEFAULT', color: '#D4AF37', user: 'aziz', role: 'STYLIST' },
    { firstName: 'Rasmata', lastName: 'SAWADOGO', position: 'Tresseuse / locticienne', contractType: 'CDI', baseSalary: 60000, commissionMode: 'SERVICE_DEFAULT', color: '#B91C1C', user: 'rasmata', role: 'STYLIST' },
    { firstName: 'Clarisse', lastName: 'KABORÉ', position: 'Tresseuse', contractType: 'PRESTATAIRE', baseSalary: 0, commissionMode: 'PERCENT', commissionRate: 45, color: '#7C3AED', user: 'clarisse', role: 'STYLIST' },
    { firstName: 'Salif', lastName: 'TRAORÉ', position: 'Barbier', contractType: 'CDD', baseSalary: 50000, commissionMode: 'SERVICE_DEFAULT', color: '#0E7490', user: 'salif', role: 'STYLIST' },
    { firstName: 'Aminata', lastName: 'ZONGO', position: 'Caissière / accueil', contractType: 'CDI', baseSalary: 65000, commissionMode: 'NONE', isStylist: false, color: '#15803D', user: 'caisse', role: 'CASHIER' },
    { firstName: 'Moussa', lastName: 'ILBOUDO', position: 'Responsable du salon', contractType: 'CDI', baseSalary: 120000, commissionMode: 'NONE', isStylist: false, color: '#1D4ED8', user: 'responsable', role: 'MANAGER' },
    { firstName: 'Bintou', lastName: 'NIKIÉMA', position: 'Gestionnaire de stock', contractType: 'CDD', baseSalary: 55000, commissionMode: 'NONE', isStylist: false, color: '#9A3412', user: 'stock', role: 'STOCK_MANAGER' },
  ] as const;
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - DAYS * 86_400_000);
  const users: Record<string, AuthUser> = {};
  const staff: Record<string, string> = {};
  for (const s of STAFF) {
    const { user, role, ...data } = s as any;
    const st = await prisma.$transaction(async (tx) => tx.staff.create({ data: { ...data, code: await nextCode(tx, 'EMP', 3), hireDate: new Date(start.getTime() - int(60, 900) * 86_400_000) } }));
    staff[user] = st.id;
    const u = await prisma.user.create({ data: { username: user, fullName: `${s.firstName} ${s.lastName}`, roleId: roles[role].id, staffId: st.id, passwordHash: await hashPassword('Demo2026!') } });
    users[user] = asUser(u, role, st.id);
  }
  const stylists = ['aziz', 'rasmata', 'clarisse', 'salif'];
  const cashier = users['caisse'];

  // ─── Fournisseurs et produits ───
  const sup1 = await prisma.supplier.create({ data: { name: 'Ets Beauté Afrique (Rood Woko)', phone: '25 31 22 10', address: 'Marché Rood Woko, Ouagadougou' } });
  const sup2 = await prisma.supplier.create({ data: { name: 'Karité Wend-Kuni (coopérative)', phone: '70 45 12 98', address: 'Koudougou' } });
  const pcats = Object.fromEntries((await prisma.productCategory.findMany()).map((c) => [c.code, c.id]));
  const products: Record<string, string> = {};
  for (const p of PRODUCTS) {
    const prod = await prisma.product.create({ data: { reference: p.reference, name: p.name, categoryId: pcats[p.cat], supplierId: p.cat === 'HUILE' || p.reference === 'SHP-KARITE' ? sup2.id : sup1.id, purchasePrice: p.buy, salePrice: p.sell, minQuantity: p.min, sellable: !(p as any).internal } });
    products[p.reference] = prod.id;
    await prisma.$transaction(async (tx) => stock.move(tx, { productId: prod.id, type: 'IN', quantity: p.qty, unitCost: p.buy, reason: 'Stock initial (démonstration)', userId: owner.id }));
  }

  // ─── Clients ───
  const clientIds: string[] = [];
  const genders = ['MALE', 'FEMALE', 'FEMALE', 'MALE', 'CHILD_FEMALE', 'CHILD_MALE'] as const;
  const prefs: Record<string, string[]> = { MALE: ['Locks moyennes, retouche au crochet', 'Dégradé bas + barbe', 'Starter locs', 'Twists éponge'], FEMALE: ['Knotless longues', 'Faux locs', 'Locks naturelles, coiffage chignon', 'Fulani braids avec perles', 'Soin vapeur mensuel'], CHILD_FEMALE: ['Nattes collées simples', 'Tresses avec perles'], CHILD_MALE: ['Coupe courte'] };
  for (let i = 0; i < 60; i++) {
    const gender = pick(genders as unknown as string[]) as any;
    const male = gender === 'MALE' || gender === 'CHILD_MALE';
    const phone = gender.startsWith('CHILD') ? undefined : `${pick(['70', '71', '72', '74', '75', '76', '77', '78', '60', '61', '62', '63', '64', '65', '66', '67'])}${String(int(100000, 999999))}`;
    try {
      const c = await clientsSvc.create({ firstName: pick(male ? FIRST_M : FIRST_F), lastName: pick(LAST), phone, gender, preferences: pick(prefs[gender]) }, cashier);
      clientIds.push(c.id);
    } catch { /* doublon de numéro aléatoire : ignoré */ }
  }
  const clients = await prisma.client.findMany();

  // ─── Prestations par profil ───
  const services = await prisma.service.findMany({ include: { category: true } });
  const byCat = (codes: string[]) => services.filter((s) => codes.includes(s.category.code));
  const forClient = (g: string) => g === 'MALE' ? byCat(['DRH', 'ENT', 'COH', 'SOI']) : g === 'FEMALE' ? byCat(['DRF', 'ENT', 'CAF', 'SOI']) : byCat(['ENF']);
  const stylistFor = (catCode: string) => (catCode === 'COH' ? 'salif' : catCode === 'CAF' || catCode === 'ENF' ? pick(['rasmata', 'clarisse']) : catCode === 'SOI' ? pick(stylists) : pick(['aziz', 'rasmata']));
  const ecats = Object.fromEntries((await prisma.expenseCategory.findMany()).map((c) => [c.code, c.id]));

  // ─── Jours d'activité ───
  for (let d = 0; d <= DAYS; d++) {
    const day = new Date(start.getTime() + d * 86_400_000);
    const isToday = d === DAYS;
    if (day.getUTCDay() === 0 && !isToday) continue; // fermé le dimanche
    const iso = day.toISOString().slice(0, 10);
    const marker = new Date();
    await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, 'CAI', 4, day);
      await tx.cashSession.create({ data: { number, openingAmount: 25000, openedById: cashier.id } });
    });
    const nb = isToday ? 4 : int(5, 11) + (day.getUTCDay() === 6 ? 4 : 0);
    let hour = 8;
    for (let k = 0; k < nb; k++) {
      const client = rnd() < 0.15 ? null : pick(clients);
      const pool = forClient(client?.gender ?? 'MALE');
      const s = pick(pool);
      const sty = stylistFor(s.category.code);
      const unitPrice = s.priceMax ? round(s.price + rnd() * (s.priceMax - s.price)) : s.price;
      const items: any[] = [{ type: 'SERVICE', serviceId: s.id, staffId: staff[sty], quantity: 1, unitPrice }];
      if (rnd() < 0.3) {
        const prod = pick(PRODUCTS.filter((p) => !(p as any).internal));
        const q = await prisma.product.findUniqueOrThrow({ where: { id: products[prod.reference] } });
        if (q.quantity > 2) items.push({ type: 'PRODUCT', productId: q.id, quantity: 1 });
      }
      const startAt = new Date(`${iso}T${String(Math.min(hour, 19)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}:00.000Z`);
      hour += rnd() < 0.5 ? 1 : 0;
      let appointmentId: string | undefined;
      if (client && rnd() < 0.55) {
        try {
          const a = await apptSvc.create({ clientId: client.id, staffId: staff[sty], startAt: startAt.toISOString(), serviceIds: [s.id], status: 'CONFIRMED' }, cashier);
          appointmentId = a.id;
        } catch { /* créneau pris */ }
      }
      if (isToday && appointmentId && k >= 2) continue; // RDV du jour encore à venir
      const total = items.reduce((a, it) => a + (it.unitPrice ?? 0), 0) + (items[1] ? PRODUCTS.find((p) => products[p.reference] === items[1].productId)!.sell : 0);
      const r = rnd();
      const method = r < 0.55 ? 'CASH' : r < 0.85 ? 'ORANGE_MONEY' : r < 0.97 ? 'MOOV_MONEY' : 'BANK_TRANSFER';
      const partial = rnd() < 0.08 && total >= 10000;
      const payments = [{ method, amount: partial ? round(total / 2, 1000) : total, reference: method === 'CASH' ? undefined : `${method === 'ORANGE_MONEY' ? 'OM' : method === 'MOOV_MONEY' ? 'MM' : 'VIR'}${iso.replace(/-/g, '')}.${int(1000, 9999)}` }];
      try {
        await salesSvc.create({ clientId: client?.id, appointmentId, items, payments, saleDate: new Date(startAt.getTime() + s.durationMin * 60_000).toISOString() } as any, cashier);
      } catch (e) { Logger.warn(`Vente ignorée : ${(e as Error).message}`, 'Démo'); }
    }
    // Absences / annulations
    if (!isToday && rnd() < 0.4) {
      const c = pick(clients.filter((x) => x.phone));
      try {
        const a = await apptSvc.create({ clientId: c.id, staffId: staff[pick(stylists)], startAt: `${iso}T20:00:00.000Z`, serviceIds: [pick(services).id] }, cashier);
        await prisma.appointment.update({ where: { id: a.id }, data: rnd() < 0.5 ? { status: 'NO_SHOW' } : { status: 'CANCELLED', cancelReason: 'Client empêché (prévenu par téléphone)' } });
      } catch { /* ignore */ }
    }
    // Consommation interne et petites dépenses
    if (day.getUTCDay() === 1) {
      await prisma.$transaction(async (tx) => stock.move(tx, { productId: products['HUI-KARITE'], type: 'USAGE', quantity: -1, reason: "Bains d'huile en salon", userId: owner.id }).catch(() => null));
      await finance.createExpense({ categoryId: ecats.FOURNITURES, label: 'Eau minérale et thé pour la clientèle', amount: 3500, expenseDate: iso, method: 'CASH' }, cashier).catch(() => null);
    }
    if (day.getUTCDate() === 5) {
      await finance.createExpense({ categoryId: ecats.LOYER, label: 'Loyer du local (Ouaga 2000)', amount: 150000, expenseDate: iso, method: 'BANK_TRANSFER', reference: `VIR-LOYER-${iso}` }, ownerU);
      await finance.createExpense({ categoryId: ecats.ELECTRICITE, label: 'Facture SONABEL', amount: int(28, 42) * 1000, expenseDate: iso, method: 'ORANGE_MONEY', reference: `OM-SNB-${iso}` }, ownerU);
      await finance.createExpense({ categoryId: ecats.EAU, label: 'Facture ONEA', amount: int(6, 11) * 1000, expenseDate: iso, method: 'ORANGE_MONEY', reference: `OM-ONEA-${iso}` }, ownerU);
      await finance.createExpense({ categoryId: ecats.COMMUNICATION, label: 'Forfait internet + crédit téléphone', amount: 15000, expenseDate: iso, method: 'ORANGE_MONEY', reference: `OM-COM-${iso}` }, ownerU);
    }
    if (day.getUTCDate() === 28 || (isToday && false)) {
      await finance.createExpense({ categoryId: ecats.SALAIRES, label: 'Salaires du mois (fixes)', amount: 425000, expenseDate: iso, method: 'BANK_TRANSFER', reference: `VIR-SAL-${iso}` }, ownerU);
    }
    if (d === Math.floor(DAYS / 2)) {
      await finance.createExpense({ categoryId: ecats.ENTRETIEN, label: 'Réparation climatiseur', amount: 35000, expenseDate: iso, paidAmount: 0, notes: 'À régler au technicien' }, ownerU);
      await finance.createExpense({ categoryId: ecats.PUBLICITE, label: 'Sponsorisation page Facebook', amount: 10000, expenseDate: iso, method: 'ORANGE_MONEY', reference: 'OM-PUB-1' }, ownerU);
      await finance.createIncome({ label: 'Location de poste à une tresseuse indépendante', category: 'Location de poste', amount: 25000, method: 'CASH', incomeDate: iso }, cashier);
    }

    // Clôture de caisse (sauf aujourd'hui)
    if (!isToday) {
      const sess = await prisma.cashSession.findFirstOrThrow({ where: { status: 'OPEN' } });
      const expected = await cash.expected(prisma, sess.id, sess.openingAmount);
      const diff = rnd() < 0.15 ? pick([-500, -1000, 500]) : 0;
      await prisma.cashSession.update({ where: { id: sess.id }, data: { status: 'CLOSED', closedById: cashier.id, closedAt: new Date(`${iso}T20:30:00.000Z`), expectedAmount: expected, countedAmount: expected + diff, difference: diff, differenceReason: diff ? 'Erreur de rendu de monnaie' : null, openedAt: new Date(`${iso}T07:45:00.000Z`) } });
    } else {
      await prisma.cashSession.updateMany({ where: { status: 'OPEN' }, data: { openedAt: new Date(`${iso}T07:45:00.000Z`) } });
    }
    // Horodatage des écritures de la journée simulée
    const t = new Date(`${iso}T18:00:00.000Z`);
    if (!isToday) {
      await prisma.$executeRaw`UPDATE "Payment" p SET "paidAt" = s."saleDate", "createdAt" = s."saleDate" FROM "Sale" s WHERE p."saleId" = s."id" AND p."createdAt" >= ${marker}`;
      await prisma.$executeRaw`UPDATE "Sale" SET "createdAt" = "saleDate" WHERE "createdAt" >= ${marker}`;
      await prisma.$executeRaw`UPDATE "CashMovement" SET "createdAt" = ${t} WHERE "createdAt" >= ${marker}`;
      await prisma.$executeRaw`UPDATE "StockMovement" SET "createdAt" = ${t} WHERE "createdAt" >= ${marker}`;
      await prisma.$executeRaw`UPDATE "Commission" SET "createdAt" = ${t}, "earnedAt" = CASE WHEN "earnedAt" IS NULL THEN NULL ELSE ${t}::timestamp END WHERE "createdAt" >= ${marker}`;
      await prisma.$executeRaw`UPDATE "LoyaltyTransaction" SET "createdAt" = ${t} WHERE "createdAt" >= ${marker}`;
      await prisma.$executeRaw`UPDATE "SupplierPayment" SET "paidAt" = ${t} WHERE "paidAt" >= ${marker}`;
      await prisma.$executeRaw`UPDATE "Expense" SET "createdAt" = ${t} WHERE "createdAt" >= ${marker}`;
      await prisma.$executeRaw`UPDATE "Appointment" SET "createdAt" = "startAt" - interval '2 days' WHERE "createdAt" >= ${marker}`;
      await prisma.$executeRaw`UPDATE "AuditLog" SET "createdAt" = ${t} WHERE "createdAt" >= ${marker}`;
    }
    if (d % 10 === 0) Logger.log(`Jour ${d}/${DAYS} (${iso})`, 'Démo');
  }
  // Dates d'inscription des clients réparties sur la période
  for (const c of clients) await prisma.client.update({ where: { id: c.id }, data: { createdAt: new Date(start.getTime() + int(0, DAYS - 1) * 86_400_000) } });

  // Rendez-vous à venir (demain et après-demain)
  for (let d = 1; d <= 2; d++) {
    const iso = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    for (const [i, sty] of stylists.entries()) {
      const c = pick(clients.filter((x) => x.phone));
      const s = pick(forClient(c.gender));
      await apptSvc.create({ clientId: c.id, staffId: staff[sty], startAt: `${iso}T${String(9 + i).padStart(2, '0')}:00:00.000Z`, serviceIds: [s.id], status: d === 1 ? 'CONFIRMED' : 'PENDING' }, cashier).catch(() => null);
    }
  }

  // Achat fournisseur partiellement payé (dette) et règlement de commissions
  await prisma.$transaction(async (tx) => {
    const lines = [{ id: products['MECHE-XP'], q: 40, c: 1000 }, { id: products['GEL-LOCK'], q: 10, c: 3100 }, { id: products['CIRE-LOCK'], q: 6, c: 3500 }];
    const total = lines.reduce((a, l) => a + l.q * l.c, 0);
    const number = await nextNumber(tx, 'ACH');
    const p = await tx.purchase.create({ data: { number, supplierId: sup1.id, purchaseDate: new Date(Date.now() - 5 * 86_400_000), total, paidAmount: 50000, status: 'PARTIAL', reference: 'FA-2026-118', createdById: owner.id, lines: { create: lines.map((l) => ({ productId: l.id, quantity: l.q, unitCost: l.c, total: l.q * l.c })) } } });
    for (const l of lines) await stock.move(tx, { productId: l.id, type: 'PURCHASE', quantity: l.q, unitCost: l.c, reason: `Achat ${number}`, purchaseId: p.id, userId: owner.id });
    await tx.supplierPayment.create({ data: { purchaseId: p.id, amount: 50000, method: 'ORANGE_MONEY', reference: 'OM-FOURN-1', paidById: owner.id } });
  });

  const nbSales = await prisma.sale.count();
  Logger.log(`Démonstration prête : ${clients.length} clients, ${nbSales} ventes sur ${DAYS} jours. Comptes de démo : aziz, rasmata, clarisse, salif, caisse, responsable, stock — mot de passe Demo2026!`, 'Démo');
  await app.close();
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
