# salons-saas — plateforme de gestion de salons de coiffure (multi-entreprises)

| Dossier | Contenu |
|---|---|
| `apps/api` | API NestJS + Prisma + PostgreSQL (isolation par entreprise : jeton, filtre automatique, Row-Level Security) |
| `apps/web` | Application du salon (Next.js) : tableau de bord, rendez-vous, clients, prestations, employés, caisse, dépenses, stock, rapports, abonnement, support — et console super administrateur (`/plateforme`) |
| `docs/` | Architecture, base de données, authentification et accès, application du salon, abonnements et facturation, super administrateur |

## Documentation

1. `docs/01-ARCHITECTURE.md` — stack, modèle multi-tenant, rôles, modules, sécurité
2. `docs/02-BASE-DE-DONNEES.md` — tables et relations, garanties PostgreSQL
3. `docs/03-AUTHENTIFICATION-ET-ACCES.md` — inscription, sessions, mots de passe, permissions, isolation
4. `docs/04-APPLICATION-DU-SALON.md` — écrans, règles métier, routes, limites connues
5. `docs/05-ABONNEMENTS-ET-FACTURATION.md` — essai, renouvellement, paiement (Mobile Money, en ligne), impayés, suspension automatique, factures, notifications
6. `docs/06-SUPER-ADMIN.md` — console de l'éditeur : salons, utilisateurs, abonnements, paiements, revenus, statistiques, support, paramètres

## Démarrage rapide

```bash
# 1. Base PostgreSQL 16 : rôle propriétaire (migrations) + rôles de connexion
cd apps/api
npm install
DATABASE_URL="$DATABASE_MIGRATION_URL" npx prisma migrate deploy
psql "$ADMIN_DATABASE_URL" -v owner_role=salons_owner -v app_password="'…'" -v platform_password="'…'" -f prisma/sql/roles.sql
DATABASE_URL="$DATABASE_MIGRATION_URL" npm run prisma:seed

# 2. API (voir apps/api/.env.example)
npm run start:dev

# 3. Premier super administrateur (compte créé au préalable par inscription)
PLATFORM_DATABASE_URL=… npm run platform:grant -- +22670000000 PLATFORM_OWNER

# 4. Application web
cd ../web && npm install && API_URL=http://localhost:3002 npm run dev   # http://localhost:3000
```

## Tests

```bash
cd apps/api
npm test                      # unitaires
DATABASE_URL=… DATABASE_MIGRATION_URL=… PLATFORM_DATABASE_URL=… npm run test:e2e   # 90 tests de bout en bout, base de test dédiée
```
