# DREAD ROYAL MANAGEMENT SYSTEM — Architecture technique

> « Votre couronne, votre identité. » — Salon africain mixte (dreadlocks, coiffures africaines, coupes, enfants, soins, boutique). Burkina Faso — FCFA — français.

## 1. Vue d'ensemble

```
dread-royal/                      Monorepo npm workspaces
├── apps/
│   ├── api/                      Backend NestJS 11 + Prisma 6 + PostgreSQL 16
│   │   ├── prisma/               schema.prisma, migrations/, seed.ts (production), demo.ts (démonstration)
│   │   ├── src/
│   │   │   ├── common/           guards (JWT + permissions), décorateurs, audit, numérotation, filtres
│   │   │   ├── prisma/           PrismaService (transactions)
│   │   │   └── modules/          auth, users, roles, audit, settings, clients, staff, services,
│   │   │                         appointments, sales, cash, finance, commissions, stock,
│   │   │                         loyalty, dashboard, reports, sync, backup, documents (PDF)
│   │   └── test/                 tests e2e (Jest + Supertest sur une vraie base PostgreSQL)
│   └── web/                      Frontend Next.js 14 (App Router, export statique) + Tailwind + PWA
│       ├── src/app/              pages (tableau de bord, clients, rendez-vous, caisse, …)
│       ├── src/components/       UI (Sidebar, DataTable, Modal, Confirm, Toast, Charts…)
│       ├── src/lib/              client API, authentification, file hors ligne (IndexedDB), formatage
│       ├── public/               logo, manifest.webmanifest, sw.js (service worker), icônes
│       ├── capacitor.config.ts   Application Android (Capacitor 7)
│       └── android/              Projet Android natif généré (APK / AAB)
├── packages/shared/              Code partagé : rôles, permissions, enums, libellés FR, calculs de vente
├── scripts/                      sauvegarde / restauration PostgreSQL
└── docs/                         ARCHITECTURE.md, DATABASE.md, ROADMAP.md, ANDROID.md
```

## 2. Choix techniques (et pourquoi)

| Sujet | Choix | Justification |
|---|---|---|
| API | NestJS 11, REST, préfixe `/api`, Swagger `/api/docs` | Modules métier isolés, injection de dépendances, guards pour les permissions |
| Validation | `class-validator` + `ValidationPipe` (whitelist, forbidNonWhitelisted) | Aucune donnée non prévue n'atteint la base |
| ORM | Prisma 6 + migrations SQL versionnées | Schéma typé, relations, transactions interactives |
| Montants | Entiers (`Int`) en FCFA | Le franc CFA n'a pas de subdivision utilisée : aucune erreur d'arrondi |
| Auth | Identifiant + mot de passe (bcrypt, coût 12), JWT d'accès 15 min + jeton de rafraîchissement opaque (rotation, haché SHA-256 en base, révocable) | Sessions sécurisées et révocables, compatibles Web **et** Android (pas de dépendance aux cookies tiers) |
| Permissions | RBAC : rôle → liste de permissions (modifiable par le propriétaire). Vérifiées **côté serveur** par `PermissionsGuard` sur chaque route | L'interface masque seulement ; le serveur décide |
| Anti-bruteforce | Verrouillage temporaire après 5 échecs + limitation de débit (`@nestjs/throttler`) | |
| Frontend | Next.js 14 en **export statique** (`output: 'export'`) | Le même build sert le web (n'importe quel hébergement statique) et Capacitor (Android). Toute logique métier est dans l'API |
| Pages de détail | paramètres de requête (`/clients/fiche?id=…`) | Compatible export statique |
| Graphiques | Recharts | |
| PDF | `pdfkit` côté serveur (factures, reçus, tickets 80 mm, rapports) avec logo | Rendu identique sur PC et Android |
| Excel / CSV | `exceljs` / CSV UTF-8 (BOM, séparateur `;` pour Excel FR) | |
| Hors connexion | Service worker (coque applicative + lecture en cache réseau-d'abord) + file d'opérations IndexedDB + endpoint `/api/sync` idempotent | Voir §6 |
| Android | Capacitor 7 (`webDir: out`) | Même API, même base |

## 3. Sécurité

- Mots de passe : bcrypt (jamais stockés ni journalisés en clair). Changement obligatoire à la première connexion pour les comptes créés/réinitialisés.
- Secrets (`JWT_SECRET`, `DATABASE_URL`) uniquement dans `apps/api/.env` ; le frontend ne connaît que l'URL publique de l'API (`NEXT_PUBLIC_API_URL`).
- Helmet, CORS restreint (`CORS_ORIGINS`), limitation de débit globale et renforcée sur `/auth/login`.
- Journal d'audit (`AuditLog`) : qui, quoi, quand, IP, valeurs avant/après, pour toutes les écritures sensibles.
- Aucune suppression physique des données métier : désactivation (`active=false`) pour clients/produits/prestations/personnel ; **annulation tracée** (motif, auteur, date) pour ventes, paiements, dépenses. Une vente validée ne disparaît jamais.
- Opérations financières et mouvements de stock exécutés dans des **transactions** PostgreSQL (`prisma.$transaction`), stock décrémenté par mise à jour atomique conditionnelle (pas de stock négatif concurrent).

## 4. Modèle de permissions

Permissions élémentaires (extrait) : `dashboard.view`, `clients.view`, `clients.view_own`, `clients.manage`, `staff.view`, `staff.manage`, `services.view`, `services.manage`, `appointments.view_all`, `appointments.view_own`, `appointments.manage`, `sales.view`, `sales.create`, `sales.discount`, `sales.cancel`, `payments.create`, `cash.manage`, `expenses.view`, `expenses.manage`, `finance.view`, `commissions.view_all`, `commissions.view_own`, `commissions.pay`, `stock.view`, `stock.manage`, `suppliers.manage`, `loyalty.view`, `loyalty.manage`, `reports.view`, `users.manage`, `audit.view`, `settings.manage`, `backup.manage`.
Le rôle **PROPRIÉTAIRE** possède `*` (tout). Les 5 rôles initiaux sont définis dans `packages/shared/src/permissions.ts` et modifiables dans l'écran « Rôles & permissions ».

Le **coiffeur** ne voit que : son planning (`appointments.view_own`), les clients qu'il a servis ou qui ont RDV avec lui (`clients.view_own`), ses prestations et ses commissions (`commissions.view_own`). Le filtrage est fait dans les requêtes SQL côté serveur.

## 5. Règles financières (distinctions obligatoires)

| Notion | Définition dans le logiciel |
|---|---|
| **Chiffre d'affaires** | Somme des ventes **validées non annulées** de la période (date de vente), qu'elles soient payées ou non |
| **Encaissements** | Paiements reçus (nets des remboursements) + autres recettes, à leur date d'encaissement |
| **Dépenses (charges)** | Charges engagées sur la période (date de la dépense), payées ou non. Les **achats de stock** ne sont pas des charges : ils deviennent du stock |
| **Trésorerie** | Soldes par moyen (espèces, Orange Money, Moov Money, banque) = solde d'ouverture paramétré + entrées − sorties |
| **Résultat comptable** | CA + autres recettes − coût d'achat des produits vendus − consommations internes de produits − charges de la période |
| **Bénéfice estimé** | Résultat comptable − commissions dues non encore réglées (provision) |
| **Créances clients** | Reste à payer des ventes validées |
| **Dettes fournisseurs** | Achats de stock + dépenses non payées − règlements |

Le bénéfice n'est **jamais** « encaissements − décaissements ». Chaque catégorie de dépense porte un compte SYSCOHADA indicatif (classe 6) à faire valider par un professionnel comptable.

## 6. Hors connexion & synchronisation

1. Le service worker met en cache la coque de l'application et les réponses `GET` autorisées (clients, prestations, produits, personnel, planning) — stratégie réseau d'abord, cache en secours.
2. Hors ligne, les créations autorisées (client, rendez-vous, vente) sont placées dans une **file IndexedDB**, chaque opération ayant un identifiant unique (UUID v4) généré sur l'appareil.
3. Au retour du réseau, la file est envoyée à `POST /api/sync` : le serveur enregistre chaque `opId` dans `SyncOperation` (clé primaire) → **un doublon n'est jamais appliqué deux fois** (réponse `DUPLICATE` avec le résultat d'origine).
4. Conflits détectés côté serveur (créneau déjà pris, stock insuffisant, client inexistant…) → statut `CONFLICT` avec le motif, affiché à l'utilisateur pour résolution manuelle.
5. Une vente hors ligne reste « **en attente** » (bandeau orange, non comptée) tant que le serveur ne l'a pas confirmée. Le numéro de facture définitif est attribué par le serveur.
6. Indicateur de synchronisation dans l'en-tête + écran « Synchronisation » avec l'historique (local et serveur).

## 7. Sauvegardes

- Sauvegarde automatique quotidienne (`pg_dump` format custom) planifiée dans l'API (`BACKUP_CRON`, défaut 02:00), rotation (`BACKUP_KEEP`, défaut 30).
- Déclenchement manuel et téléchargement depuis l'écran Paramètres (permission `backup.manage`).
- Restauration : `scripts/restore.sh <fichier>` (opération volontairement hors interface, avec confirmation, pour éviter une restauration accidentelle).

## 8. Évolutions prévues

- Rappels WhatsApp (champ `reminderSentAt` sur les rendez-vous + service `NotificationsService` à brancher sur l'API WhatsApp Business).
- Paiement Orange Money / Moov Money en ligne (actuellement saisie manuelle de la référence de transaction).
- Multi-salons (ajout d'un `salonId` sur les tables principales).
- Plan comptable SYSCOHADA complet en partie double (journal / grand livre) après validation d'un comptable.
