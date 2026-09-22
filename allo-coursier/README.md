# ALLÔ-COURSIER

« Livraison • Courses • Services » — plateforme de GROUPE AKAMBI SARL (Ouagadougou et Tenkodogo, Burkina Faso).

Projet indépendant de la plateforme de la laverie présente à la racine de ce dépôt.

- 📄 [Cadrage, architecture, base de données et MVP](docs/01-CADRAGE-ARCHITECTURE.md)

## Avancement (phase 1)

| Lot | Contenu | État |
|---|---|---|
| 1 | Socle : base de données complète, comptes (téléphone + code secret), sessions, rôles et permissions, villes et zones, moteur de tarifs + simulateur, livreurs (inscription, validation, salariés/indépendants), paramètres, journal d'audit | ✅ Terminé |
| 2 | Commandes, attribution des missions, suivi en temps réel, chat | À venir |
| 3 | Application livreur (PWA) | À venir |
| 4 | Application client (PWA) | À venir |
| 5 | Administration web | À venir |
| 6 | Paiements, portefeuille, caisse, notifications, mise en ligne | À venir |

## Structure

```
allo-coursier/
├── apps/api/        API NestJS + Prisma + PostgreSQL
│   ├── prisma/      schéma (48 tables), migrations, seed
│   ├── src/         modules : auth, users, access (rôles), drivers, geo, pricing, settings, audit
│   └── test/        tests de bout en bout
├── infra/           docker-compose de développement (PostgreSQL)
└── docs/
```

## Démarrer en local

Prérequis : Node.js 20+ et PostgreSQL 14+ (ou Docker).

```bash
# 1. Base de données (au choix)
docker compose -f infra/docker-compose.yml up -d
#    ou, avec un PostgreSQL installé :
#    sudo -u postgres psql -c "CREATE USER allo WITH PASSWORD 'allo_dev_pwd' CREATEDB;"
#    sudo -u postgres psql -c "CREATE DATABASE allo_coursier OWNER allo;"

# 2. Dépendances
npm install

# 3. Configuration, schéma et données initiales
cd apps/api
cp .env.example .env
npx prisma migrate deploy
npm run prisma:seed

# 4. Lancer l'API
npm run start:dev
```

- API : http://localhost:3002/api/v1
- Documentation interactive : http://localhost:3002/api/docs

## Comptes créés par le seed

| Compte | Téléphone | Code / mot de passe |
|---|---|---|
| Super-administrateur | +226 70 00 00 00 | `AlloAdmin@2026` (variables `SEED_ADMIN_*`) |
| Client de démonstration | +226 76 00 00 01 | `482913` |
| Livreur de démonstration (Ouagadougou, validé) | +226 76 00 00 02 | `482913` |

Les comptes de démonstration ne sont pas créés quand `NODE_ENV=production`.

> ⚠️ Les **tarifs créés par le seed sont des exemples** (ex. Ouagadougou moto : prise en charge 500,
> minimum 1 000, 150 FCFA/km au-delà de 2 km, express +500, commission 20 %). Ils se modifient dans
> l'administration (`/admin/pricing-rules`) et doivent être validés par GROUPE AKAMBI SARL avant le lancement.

## Tests

```bash
cd apps/api
npm test            # tests unitaires (moteur de prix, zones, téléphones, codes secrets)
npm run test:e2e    # tests de bout en bout, sur une base dont le nom finit par _test
```

Base des tests de bout en bout : `TEST_DATABASE_URL`, par défaut
`postgresql://allo:allo_dev_pwd@localhost:5432/allo_coursier_test`. Elle est **vidée** à chaque lancement
(les tests refusent toute base dont le nom ne finit pas par `_test`).

## Principaux points d'API (lot 1)

| Domaine | Routes |
|---|---|
| Comptes | `POST /auth/register` (client ou livreur), `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`, `POST /auth/change-secret` |
| Mon compte | `PATCH /me`, `GET/POST/PATCH/DELETE /me/addresses` |
| Villes | `GET /cities`, `GET /geo/locate?lat&lng` |
| Devis | `POST /pricing/quote` → prix standard **et** express en un seul appel |
| Admin — tarifs | `GET/POST/PATCH/DELETE /admin/pricing-rules`, `POST /admin/pricing/simulate` |
| Admin — villes/zones | `/admin/cities`, `/admin/cities/:id/zones`, `/admin/zones/:id` |
| Admin — accès | `/admin/permissions`, `/admin/roles`, `/admin/users`, `/admin/staff` |
| Admin — livreurs | `/admin/drivers` (liste, validation, refus, modification, création des salariés) |
| Admin — divers | `/admin/settings`, `/admin/audit-logs` |

## Sécurité en bref

- Codes secrets et mots de passe chiffrés (bcrypt) ; blocage temporaire après 5 essais erronés.
- Jeton d'accès de 15 minutes + jeton de renouvellement à usage unique ; la réutilisation d'un ancien jeton ferme toutes les sessions du compte.
- Permissions vérifiées sur chaque route d'administration ; impossible d'accorder un droit qu'on ne possède pas ou de retirer le dernier super-administrateur.
- Les rôles attribués à l'inscription (client, livreur, commerçant) ne peuvent pas recevoir de droits d'administration.
- Prix toujours calculés par le serveur ; journal d'audit des actions sensibles.
