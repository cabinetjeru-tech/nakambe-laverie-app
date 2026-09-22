/**
 * Jeu de données de démonstration — NOUVELLE LAVERIE AFRICAINE.
 * Toutes les données ci-dessous sont FICTIVES et destinées uniquement aux tests (§44 du cahier des charges).
 */
import { PrismaClient, RoleName, ClientType, ServiceDomain, DeliveryMode, OrderStatus, PaymentMethod, VehicleType, InterventionMode, AppointmentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function nextNumber(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}_${year}`;
  const seq = await prisma.sequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `NK-${prefix}-${year}-${String(seq.value).padStart(6, '0')}`;
}

async function nextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const key = `order_${year}`;
  const seq = await prisma.sequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `NK-${year}-${String(seq.value).padStart(6, '0')}`;
}

async function nextClientNumber(): Promise<string> {
  const seq = await prisma.sequence.upsert({
    where: { key: 'client' },
    create: { key: 'client', value: 1 },
    update: { value: { increment: 1 } },
  });
  return `NK-CLI-${String(seq.value).padStart(6, '0')}`;
}

async function main() {
  // Idempotence : ce script est exécuté à chaque démarrage en production
  // (voir package.json "start"). On ne réinjecte les données de démo qu'une
  // seule fois, jamais à chaque redéploiement.
  const alreadySeeded = await prisma.user.findUnique({ where: { phone: '+22670000001' } });
  if (alreadySeeded) {
    console.log('Données de démonstration déjà présentes — seed ignoré.');
    return;
  }

  console.log('Démarrage du seed...');

  // ---------------------------------------------------------------------
  // 1. Rôles
  // ---------------------------------------------------------------------
  const roleDefs: { name: RoleName; description: string }[] = [
    { name: RoleName.ADMIN, description: 'Accès complet au système' },
    { name: RoleName.GERANT, description: 'Gestion quasi complète, restrictions financières possibles' },
    { name: RoleName.RECEPTIONNISTE, description: 'Accueil, commandes, encaissement' },
    { name: RoleName.AGENT_LAVERIE, description: 'Traitement des commandes de laverie/pressing' },
    { name: RoleName.AGENT_NETTOYAGE, description: 'Interventions de nettoyage mobile' },
    { name: RoleName.CHAUFFEUR, description: 'Collectes et livraisons' },
    { name: RoleName.CLIENT, description: 'Client de la plateforme' },
  ];
  const roles: Record<string, string> = {};
  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      create: r,
      update: {},
    });
    roles[r.name] = role.id;
  }

  // ---------------------------------------------------------------------
  // 2. Agence + zones
  // ---------------------------------------------------------------------
  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-tenkodogo' },
    create: {
      id: 'seed-branch-tenkodogo',
      name: 'Nouvelle Laverie Africaine — Tenkodogo',
      city: 'Tenkodogo',
      address: 'Cité du 11 Décembre, Tenkodogo, Burkina Faso',
      phone1: '+226 73 12 26 12',
      phone2: '+226 54 54 28 18',
    },
    update: {},
  });

  const zoneNames = ['Cité du 11 Décembre', 'Centre-ville Tenkodogo', 'Secteur 4', 'Route de Koupéla'];
  const zones = [];
  for (const name of zoneNames) {
    const zone = await prisma.zone.create({
      data: { branchId: branch.id, name, travelFee: name === 'Cité du 11 Décembre' ? 0 : 1000 },
    });
    zones.push(zone);
  }

  // ---------------------------------------------------------------------
  // 3. Utilisateurs internes (5 employés)
  // ---------------------------------------------------------------------
  const defaultPassword = await hash('Nakambe@2026');

  async function upsertEmployee(
    phone: string,
    fullName: string,
    roleName: RoleName,
    position: string,
  ) {
    const user = await prisma.user.upsert({
      where: { phone },
      create: {
        phone,
        fullName,
        passwordHash: defaultPassword,
        roleId: roles[roleName],
        branchId: branch.id,
        employee: { create: { branchId: branch.id, position, hireDate: new Date('2025-01-15') } },
      },
      update: {},
      include: { employee: true },
    });
    return user;
  }

  const admin = await upsertEmployee('+22670000001', 'Aïcha OUEDRAOGO', RoleName.ADMIN, 'Administratrice générale');
  const gerant = await upsertEmployee('+22670000002', 'Boukary SAWADOGO', RoleName.GERANT, 'Gérant d\'agence');
  const receptionniste = await upsertEmployee('+22670000003', 'Fatimata KABORE', RoleName.RECEPTIONNISTE, 'Réceptionniste / caisse');
  const agentLaverie = await upsertEmployee('+22670000004', 'Issouf ZONGO', RoleName.AGENT_LAVERIE, 'Agent laverie-pressing');
  const chauffeur = await upsertEmployee('+22670000005', 'Salif TRAORE', RoleName.CHAUFFEUR, 'Chauffeur tricycle');

  // ---------------------------------------------------------------------
  // 4. Catalogue de services
  // ---------------------------------------------------------------------
  async function makeCategory(domain: ServiceDomain, name: string, services: { name: string; unit: string; price: number }[]) {
    const category = await prisma.serviceCategory.create({ data: { domain, name } });
    for (const s of services) {
      await prisma.service.create({
        data: { categoryId: category.id, name: s.name, unit: s.unit, price: s.price },
      });
    }
    return category;
  }

  await makeCategory(ServiceDomain.LAVERIE_PRESSING, 'Laverie & Pressing', [
    { name: 'Chemise - lavage & repassage', unit: 'pièce', price: 750 },
    { name: 'Pantalon - lavage & repassage', unit: 'pièce', price: 1000 },
    { name: 'Costume complet - pressing', unit: 'pièce', price: 3500 },
    { name: 'Boubou traditionnel - pressing', unit: 'pièce', price: 2000 },
    { name: 'Robe - lavage & repassage', unit: 'pièce', price: 1500 },
    { name: 'Draps de lit - lavage', unit: 'pièce', price: 1500 },
    { name: 'Lavage de chaussures', unit: 'paire', price: 1500 },
    { name: 'Désinfection UV des chaussures', unit: 'paire', price: 1000 },
  ]);

  await makeCategory(ServiceDomain.AUTO_MOTO, 'Lavage auto/moto', [
    { name: 'Lavage moto standard', unit: 'forfait', price: 1000 },
    { name: 'Lavage moto haute pression', unit: 'forfait', price: 1500 },
    { name: 'Lavage voiture extérieur', unit: 'forfait', price: 2500 },
    { name: 'Lavage voiture complet (intérieur + extérieur)', unit: 'forfait', price: 4000 },
    { name: 'Lavage véhicule professionnel (4x4/camionnette)', unit: 'forfait', price: 6000 },
  ]);

  await makeCategory(ServiceDomain.TEXTILE_MAISON, 'Tapis, moquettes, divans, matelas', [
    { name: 'Nettoyage tapis (par m²)', unit: 'm²', price: 1500 },
    { name: 'Nettoyage divan 3 places', unit: 'forfait', price: 7500 },
    { name: 'Nettoyage divan 6 places', unit: 'forfait', price: 15000 },
    { name: 'Nettoyage matelas 1 place', unit: 'forfait', price: 5000 },
    { name: 'Nettoyage matelas 2 places', unit: 'forfait', price: 8000 },
  ]);

  await makeCategory(ServiceDomain.CHANTIER, 'Nettoyage de chantiers', [
    { name: 'Nettoyage après construction (par pièce)', unit: 'pièce', price: 15000 },
    { name: 'Nettoyage de bureaux (forfait)', unit: 'forfait', price: 25000 },
  ]);

  const mobileCategory = await makeCategory(ServiceDomain.MOBILE, 'Collecte & lavage mobile', [
    { name: 'Frais de déplacement tricycle', unit: 'forfait', price: 500 },
  ]);

  const laverieServices = await prisma.service.findMany({ where: { category: { domain: ServiceDomain.LAVERIE_PRESSING } } });
  const autoServices = await prisma.service.findMany({ where: { category: { domain: ServiceDomain.AUTO_MOTO } } });
  const textileServices = await prisma.service.findMany({ where: { category: { domain: ServiceDomain.TEXTILE_MAISON } } });

  // ---------------------------------------------------------------------
  // 5. Fidélité + promotion de démonstration
  // ---------------------------------------------------------------------
  await prisma.loyaltyRule.create({
    data: { label: '1 point par tranche de 500 FCFA dépensée', pointsPerUnit: 1, unitAmount: 500 },
  });
  await prisma.promotion.create({
    data: {
      code: 'BIENVENUE10',
      type: 'NOUVEAU_CLIENT',
      label: '10% de réduction pour les nouveaux clients',
      value: 10,
      isActive: true,
    },
  });

  // ---------------------------------------------------------------------
  // 6. Clients (10)
  // ---------------------------------------------------------------------
  const clientSeeds = [
    { fullName: 'Salamata SANOU', phone: '+22676000001', district: 'Cité du 11 Décembre', type: ClientType.PARTICULIER },
    { fullName: 'Moussa OUATTARA', phone: '+22676000002', district: 'Centre-ville Tenkodogo', type: ClientType.PARTICULIER },
    { fullName: 'Hôtel Wend-Panga', phone: '+22676000003', district: 'Centre-ville Tenkodogo', type: ClientType.HOTEL, companyName: 'Hôtel Wend-Panga' },
    { fullName: 'Restaurant Le Tenkodogolais', phone: '+22676000004', district: 'Secteur 4', type: ClientType.RESTAURANT, companyName: 'Le Tenkodogolais' },
    { fullName: 'Awa COMPAORE', phone: '+22676000005', district: 'Cité du 11 Décembre', type: ClientType.PARTICULIER },
    { fullName: 'Ibrahim NIKIEMA', phone: '+22676000006', district: 'Route de Koupéla', type: ClientType.PARTICULIER },
    { fullName: 'Préfecture de Tenkodogo', phone: '+22676000007', district: 'Centre-ville Tenkodogo', type: ClientType.ADMINISTRATION, companyName: 'Préfecture de Tenkodogo' },
    { fullName: 'Rasmata KYELEM', phone: '+22676000008', district: 'Secteur 4', type: ClientType.PARTICULIER },
    { fullName: 'Garage Faso Auto', phone: '+22676000009', district: 'Route de Koupéla', type: ClientType.ENTREPRISE, companyName: 'Faso Auto' },
    { fullName: 'Aminata DERRA', phone: '+22676000010', district: 'Cité du 11 Décembre', type: ClientType.PARTICULIER },
  ];

  const clients = [];
  for (const c of clientSeeds) {
    const clientNumber = await nextClientNumber();
    const zone = zones.find((z) => z.name === c.district) ?? zones[0];
    const client = await prisma.client.create({
      data: {
        clientNumber,
        fullName: c.fullName,
        phone: c.phone,
        whatsapp: c.phone,
        district: c.district,
        address: `${c.district}, Tenkodogo`,
        type: c.type,
        companyName: c.companyName,
        branchId: branch.id,
        zoneId: zone.id,
      },
    });
    clients.push(client);
  }

  // Un client avec compte de connexion (démonstration de l'espace client)
  await prisma.user.upsert({
    where: { phone: clients[0].phone },
    create: {
      phone: clients[0].phone,
      fullName: clients[0].fullName,
      passwordHash: await hash('Client@2026'),
      roleId: roles[RoleName.CLIENT],
      client: { connect: { id: clients[0].id } },
    },
    update: {},
  });

  // ---------------------------------------------------------------------
  // 7. Rendez-vous (5)
  // ---------------------------------------------------------------------
  const appointmentDomains = [ServiceDomain.LAVERIE_PRESSING, ServiceDomain.AUTO_MOTO, ServiceDomain.TEXTILE_MAISON, ServiceDomain.LAVERIE_PRESSING, ServiceDomain.CHANTIER];
  for (let i = 0; i < 5; i++) {
    const client = clients[i];
    await prisma.appointment.create({
      data: {
        clientId: client.id,
        zoneId: client.zoneId,
        domain: appointmentDomains[i],
        mode: i % 2 === 0 ? InterventionMode.A_DOMICILE : InterventionMode.AU_SIEGE,
        scheduledDate: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
        address: client.address ?? undefined,
        quantityNote: 'Environ 10 pièces',
        status: i === 0 ? AppointmentStatus.CONFIRME : AppointmentStatus.DEMANDE,
      },
    });
  }

  // ---------------------------------------------------------------------
  // 8. Commandes (10) avec statuts variés + paiements (5) + factures (3)
  // ---------------------------------------------------------------------
  const statusesForDemo: OrderStatus[] = [
    OrderStatus.DEMANDE_RECUE,
    OrderStatus.RECEPTIONNE,
    OrderStatus.LAVAGE,
    OrderStatus.SECHAGE,
    OrderStatus.REPASSAGE,
    OrderStatus.CONTROLE_QUALITE,
    OrderStatus.PRET,
    OrderStatus.LIVRAISON_PROGRAMMEE,
    OrderStatus.LIVRE,
    OrderStatus.TERMINE,
  ];

  const orders = [];
  for (let i = 0; i < 10; i++) {
    const client = clients[i];
    const domain = i % 3 === 0 ? ServiceDomain.AUTO_MOTO : i % 3 === 1 ? ServiceDomain.TEXTILE_MAISON : ServiceDomain.LAVERIE_PRESSING;
    const pool = domain === ServiceDomain.AUTO_MOTO ? autoServices : domain === ServiceDomain.TEXTILE_MAISON ? textileServices : laverieServices;
    const service = pool[i % pool.length];
    const quantity = 1 + (i % 3);
    const unitPrice = Number(service.price);
    const subtotal = unitPrice * quantity;
    const discount = i === 4 ? 500 : 0;
    const total = subtotal - discount;
    const orderNumber = await nextOrderNumber();
    const status = statusesForDemo[i];

    const order = await prisma.order.create({
      data: {
        orderNumber,
        clientId: client.id,
        branchId: branch.id,
        zoneId: client.zoneId,
        domain,
        status,
        deliveryMode: i % 2 === 0 ? DeliveryMode.LIVRAISON : DeliveryMode.RETRAIT_SUR_PLACE,
        address: client.address,
        subtotal,
        discount,
        total,
        qrCode: orderNumber,
        assignedAgentId: agentLaverie.id,
        driverId: i % 2 === 0 ? chauffeur.id : null,
        items: {
          create: [
            {
              serviceId: service.id,
              label: service.name,
              quantity,
              unitPrice,
              total: subtotal,
            },
          ],
        },
        statusHistory: {
          create: { status: OrderStatus.DEMANDE_RECUE, changedById: receptionniste.id, comment: 'Commande créée (démo)' },
        },
      },
    });
    orders.push(order);
  }

  // Paiements (5) sur les 5 premières commandes
  for (let i = 0; i < 5; i++) {
    const order = orders[i];
    const paymentNumber = await nextNumber('PAI');
    await prisma.payment.create({
      data: {
        paymentNumber,
        clientId: order.clientId,
        orderId: order.id,
        amount: Number(order.total),
        method: i % 2 === 0 ? PaymentMethod.ESPECES : PaymentMethod.ORANGE_MONEY,
        transactionRef: i % 2 === 0 ? undefined : `OM-DEMO-${1000 + i}`,
        receivedById: receptionniste.id,
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { amountPaid: order.total } });
  }

  // Factures (3) à partir des 3 premières commandes
  for (let i = 0; i < 3; i++) {
    const order = orders[i];
    const invoiceNumber = await nextNumber('FAC');
    await prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId: order.id,
        clientId: order.clientId,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
        amountPaid: order.amountPaid,
        status: Number(order.amountPaid) >= Number(order.total) ? 'PAYEE' : 'IMPAYEE',
      },
    });
  }

  // ---------------------------------------------------------------------
  // 9. Devis (3)
  // ---------------------------------------------------------------------
  for (let i = 0; i < 3; i++) {
    const client = clients[5 + i];
    const service = textileServices[i % textileServices.length];
    const unitPrice = Number(service.price);
    const quoteNumber = await nextNumber('DEV');
    await prisma.quote.create({
      data: {
        quoteNumber,
        clientId: client.id,
        subtotal: unitPrice,
        discount: 0,
        total: unitPrice,
        validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        conditions: 'Devis valable 15 jours. Acompte de 50% à la validation.',
        items: {
          create: [{ serviceId: service.id, label: service.name, quantity: 1, unitPrice, total: unitPrice }],
        },
      },
    });
  }

  // ---------------------------------------------------------------------
  // 10. Fournisseurs (3) + produits de stock (5) + mouvements
  // ---------------------------------------------------------------------
  const supplierSeeds = [
    { name: 'Faso Détergents SARL', phone: '+22625000001', address: 'Ouagadougou' },
    { name: 'Burkina Emballages', phone: '+22625000002', address: 'Ouagadougou' },
    { name: 'Quincaillerie Tenkodogo Plus', phone: '+22625000003', address: 'Tenkodogo' },
  ];
  const suppliers = [];
  for (const s of supplierSeeds) {
    suppliers.push(await prisma.supplier.create({ data: { ...s, branchId: branch.id } }));
  }

  const productSeeds = [
    { name: 'Savon liquide (bidon 20L)', unit: 'bidon', currentStock: 12, minThreshold: 3, purchasePrice: 15000 },
    { name: 'Désinfectant textile', unit: 'bidon', currentStock: 8, minThreshold: 2, purchasePrice: 12000 },
    { name: 'Parfum textile', unit: 'flacon', currentStock: 20, minThreshold: 5, purchasePrice: 2500 },
    { name: 'Sacs d\'emballage', unit: 'paquet', currentStock: 2, minThreshold: 5, purchasePrice: 3000 },
    { name: 'Gants de protection', unit: 'paire', currentStock: 30, minThreshold: 10, purchasePrice: 500 },
  ];
  for (const p of productSeeds) {
    const product = await prisma.product.create({ data: { ...p, branchId: branch.id } });
    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        supplierId: suppliers[0].id,
        type: 'ENTREE',
        quantity: p.currentStock,
        unitPrice: p.purchasePrice,
        reason: 'Stock initial (démo)',
      },
    });
  }

  // ---------------------------------------------------------------------
  // 11. Véhicules (3)
  // ---------------------------------------------------------------------
  await prisma.vehicle.createMany({
    data: [
      { branchId: branch.id, type: VehicleType.TRICYCLE, label: 'Tricycle 1', plateNumber: 'TK-001' },
      { branchId: branch.id, type: VehicleType.TRICYCLE, label: 'Tricycle 2', plateNumber: 'TK-002' },
      { branchId: branch.id, type: VehicleType.MOTO, label: 'Moto de service', plateNumber: 'TK-M01' },
    ],
  });

  // ---------------------------------------------------------------------
  // 12. Paramètres de l'entreprise
  // ---------------------------------------------------------------------
  const settings: Record<string, string> = {
    company_name: 'NOUVELLE LAVERIE AFRICAINE',
    company_slogan: 'Laverie express et digitale',
    company_address: 'Cité du 11 Décembre, Tenkodogo, Burkina Faso',
    company_phone_1: '+226 73 12 26 12',
    company_phone_2: '+226 54 54 28 18',
    opening_hours: 'Tous les jours : 6h30 - 20h00',
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  console.log('Seed terminé avec succès.');
  console.log('');
  console.log('Comptes de démonstration (mot de passe entre parenthèses) :');
  console.log('  Admin           : +22670000001 (Nakambe@2026)');
  console.log('  Gérant          : +22670000002 (Nakambe@2026)');
  console.log('  Réceptionniste  : +22670000003 (Nakambe@2026)');
  console.log('  Agent laverie   : +22670000004 (Nakambe@2026)');
  console.log('  Chauffeur       : +22670000005 (Nakambe@2026)');
  console.log('  Client démo     : ' + clients[0].phone + ' (Client@2026)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
