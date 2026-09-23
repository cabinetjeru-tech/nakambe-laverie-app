# Base de données — structure et relations

> Référence : `apps/api/prisma/schema.prisma` (101 tables, 45 énumérations) et ses deux migrations.
> Ce document explique **comment les tables s'articulent**. Le détail des colonnes est commenté dans
> le schéma lui-même.

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` | Tables, colonnes, relations, index |
| `prisma/migrations/20260923120000_init` | SQL généré par Prisma (+ extension `pg_trgm`) |
| `prisma/migrations/20260923120100_securite_postgres` | Ce que Prisma ne sait pas exprimer : RLS, anti-double-booking, contraintes CHECK, tables en ajout seul, registre équilibré |
| `prisma/sql/roles.sql` | Rôles de connexion `salons_app` (soumis à RLS) et `salons_platform` (console éditeur) |
| `prisma/sql/verification.sql` | 9 contrôles automatiques des garanties ci-dessus |

---

## 1. Les trois règles qui structurent tout

1. **Identité globale, données au tenant.** `users` n'appartient à personne : un même numéro de
   téléphone peut être coiffeur chez A (`memberships`) et client chez B (`client_profiles`). Tout le
   reste porte `tenant_id`.
2. **Clés étrangères composites.** Chaque table tenant a une clé unique `(tenant_id, id)` et référence
   les autres tables tenant par `(tenant_id, x_id)`. Rattacher un rendez-vous du salon A à un client du
   salon B est **physiquement impossible**, même par bug. Conséquence pour le code : détacher une
   relation facultative se fait en écrivant `xId: null`, jamais avec `disconnect`.
3. **Row-Level Security.** Toute table avec `tenant_id` n'affiche que les lignes du tenant placé dans
   `app.tenant_id` pour la transaction. Sans contexte, rien n'est visible.

---

## 2. Plateforme, accès et abonnements

```mermaid
erDiagram
    PLANS ||--o{ PLAN_FEATURES : "inclut"
    PLANS ||--o{ TENANTS : "offre actuelle"
    PLANS ||--o{ SAAS_SUBSCRIPTIONS : "souscrite"
    TENANTS ||--o{ SAAS_SUBSCRIPTIONS : "historique"
    SAAS_SUBSCRIPTIONS ||--o{ SAAS_INVOICES : "facture"
    SAAS_INVOICES ||--o{ SAAS_PAYMENTS : "réglée par"
    TENANTS ||--o{ SALONS : "possède"
    TENANTS ||--o{ ROLES : "définit"
    ROLES ||--o{ ROLE_PERMISSIONS : "accorde"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "catalogue"
    USERS ||--o{ MEMBERSHIPS : "travaille pour"
    TENANTS ||--o{ MEMBERSHIPS : "emploie"
    MEMBERSHIPS ||--o{ MEMBERSHIP_ROLES : "a"
    ROLES ||--o{ MEMBERSHIP_ROLES : ""
    MEMBERSHIPS ||--o{ MEMBERSHIP_SALONS : "périmètre"
    SALONS ||--o{ MEMBERSHIP_SALONS : ""
    MEMBERSHIPS ||--o| STAFF_MEMBERS : "profil pro"
    USERS ||--o{ CLIENT_PROFILES : "est client de"
    TENANTS ||--o{ CLIENT_PROFILES : "fichier clients"
    USERS ||--o{ USER_SESSIONS : "se connecte"
```

- **Deux sortes d'« abonnements »** :
  - `saas_subscriptions` : le salon paie la plateforme (offre, période, prix figé, factures `saas_invoices`) ;
  - `prepaid_packages` / `client_packages` : le salon vend un carnet à son client (§4).
- `tenants.plan_id` donne l'offre en vigueur, `saas_subscriptions` en garde l'historique.
- Fonctionnalités effectives = `plan_features` ± `feature_overrides`.
- Un employé peut exister **sans compte** (`staff_members.membership_id` facultatif), par exemple un apprenti sans téléphone.

---

## 3. Salons, équipe, catalogue, clients et agenda

```mermaid
erDiagram
    SALONS ||--o{ SALON_OPENING_HOURS : "ouvre"
    SALONS ||--o{ RESOURCES : "fauteuils, bacs"
    SALONS ||--o{ STAFF_SALONS : ""
    STAFF_MEMBERS ||--o{ STAFF_SALONS : "travaille dans"
    STAFF_MEMBERS ||--o{ STAFF_SCHEDULES : "planning"
    STAFF_MEMBERS ||--o{ STAFF_TIME_OFF : "absences"
    STAFF_MEMBERS ||--o{ STAFF_SKILLS : "sait faire"
    SERVICES ||--o{ STAFF_SKILLS : ""
    SERVICE_CATEGORIES ||--o{ SERVICES : "classe"
    SERVICES ||--o{ SERVICE_VARIANTS : "variantes"
    SERVICES ||--o{ SERVICE_STEPS : "étapes / temps de pose"
    SERVICES ||--o{ SERVICE_SALON_PRICES : "prix par salon"
    SALONS ||--o{ APPOINTMENTS : "accueille"
    CLIENT_PROFILES ||--o{ APPOINTMENTS : "réserve"
    APPOINTMENTS ||--|{ APPOINTMENT_ITEMS : "contient"
    SERVICES ||--o{ APPOINTMENT_ITEMS : ""
    STAFF_MEMBERS ||--o{ APPOINTMENT_ITEMS : "réalise"
    APPOINTMENT_ITEMS ||--o{ STAFF_BUSY_SLOTS : "occupe"
    APPOINTMENT_ITEMS ||--o{ RESOURCE_BUSY_SLOTS : "occupe"
    BOOKING_HOLDS ||--o{ STAFF_BUSY_SLOTS : "bloque temporairement"
    APPOINTMENTS ||--o{ APPOINTMENT_STATUS_HISTORY : "trace"
    SALONS ||--o{ WAITLIST_ENTRIES : "file d'attente"
    WAITLIST_ENTRIES |o--o| APPOINTMENTS : "devient"
    CLIENT_PROFILES ||--o{ CLIENT_TECHNICAL_NOTES : "fiche technique"
    CLIENT_PROFILES ||--o{ CLIENT_PHOTOS : "avant / après"
    CLIENT_PROFILES ||--o{ CLIENT_CONSENTS : "consentements"
```

### Comment un rendez-vous occupe l'agenda

Une prestation se découpe en **étapes** (`service_steps`). Seules les étapes `blocks_staff = true`
occupent le coiffeur : pendant un temps de pose il reste réservable pour un autre client.

```
Rendez-vous 09:00–13:00 (appointments)
 └─ Ligne « Coloration » avec Awa, 09:00–10:30 (appointment_items, prix et durée figés)
     ├─ Application 09:00–09:30  → staff_busy_slots (Awa occupée)
     ├─ Pose        09:30–10:10  → aucune occupation : Awa est libre
     └─ Rinçage     10:10–10:30  → staff_busy_slots + resource_busy_slots (bac n° 1)
```

`staff_busy_slots.slot` est une plage `tstzrange` **générée** par PostgreSQL. Une contrainte d'exclusion
GiST interdit deux occupations actives qui se chevauchent pour un même employé (ou une même ressource).
Si deux clients valident le même créneau à la même seconde, le second reçoit une erreur `23P01` et l'API
lui propose un autre créneau. Pendant un paiement d'acompte en ligne, un `booking_hold` bloque le créneau
une dizaine de minutes ; à l'annulation ou à l'expiration, `is_active = false` libère le créneau.

---

## 4. Ventes, paiements, caisse, dépenses et stock

```mermaid
erDiagram
    SALONS ||--o{ SALES : "encaisse"
    CLIENT_PROFILES ||--o{ SALES : "achète"
    APPOINTMENTS ||--o{ SALES : "facturé par"
    SALES ||--|{ SALE_ITEMS : "lignes"
    SALE_ITEMS }o--o| SERVICES : "prestation"
    SALE_ITEMS }o--o| PRODUCTS : "produit"
    SALE_ITEMS }o--o| STAFF_MEMBERS : "crédite"
    SALES ||--o{ TIPS : "pourboires"
    SALES ||--o{ PAYMENTS : "réglée par"
    APPOINTMENTS ||--o{ PAYMENTS : "acompte"
    PAYMENTS ||--o{ PAYMENT_TRANSACTIONS : "échanges agrégateur"
    PAYMENTS ||--o{ REFUNDS : "remboursements"
    SALES ||--o{ INVOICES : "facture / avoir"
    SALONS ||--o{ CASH_REGISTERS : "caisses"
    CASH_REGISTERS ||--o{ CASH_SESSIONS : "ouverture / clôture"
    CASH_SESSIONS ||--o{ PAYMENTS : "espèces"
    CASH_SESSIONS ||--o{ CASH_MOVEMENTS : "apports / retraits"
    CASH_SESSIONS ||--o{ EXPENSES : "dépenses en espèces"
    SALONS ||--o{ EXPENSES : "dépenses"
    EXPENSE_CATEGORIES ||--o{ EXPENSES : "classe"
    SUPPLIERS ||--o{ EXPENSES : "payé à"
    SALE_ITEMS ||--o{ COMMISSION_ENTRIES : "génère"
    COMMISSION_ENTRIES }o--o| PAYROLL_PERIODS : "payée sur"
    PRODUCTS ||--o{ PRODUCT_STOCKS : "stock par salon"
    SALONS ||--o{ PRODUCT_STOCKS : ""
    PRODUCTS ||--o{ STOCK_MOVEMENTS : "journal"
    SALES ||--o{ STOCK_MOVEMENTS : "vente / consommation"
    SUPPLIERS ||--o{ PURCHASE_ORDERS : "commandes"
    PURCHASE_ORDERS ||--|{ PURCHASE_ORDER_LINES : ""
    PURCHASE_ORDER_LINES ||--o{ STOCK_MOVEMENTS : "réception"
    SERVICES ||--o{ SERVICE_CONSUMPTIONS : "consomme"
    PRODUCTS ||--o{ SERVICE_CONSUMPTIONS : ""
```

### Parcours d'un encaissement

1. `sales` (ticket) + `sale_items` : libellé, prix, coût d'achat et coiffeur crédité sont **copiés**.
   Modifier un tarif ne change jamais une vente passée.
2. `payments` : un ou plusieurs moyens de paiement (espèces, Mobile Money manuel, CinetPay, LigdiCash,
   carte cadeau, avoir…). Contraintes en base :
   - un paiement en espèces est rattaché à une session de caisse ouverte ;
   - un couple (moyen, référence opérateur) n'est utilisable qu'**une fois** : une même référence
     Mobile Money ne peut pas servir deux fois ;
   - `idempotency_key` empêche un double encaissement en cas de double clic ou de rejeu hors ligne.
3. `ledger_entries` : chaque opération d'argent écrit des lignes en **partie double**. Un trigger vérifie
   à la validation de la transaction que les débits égalent les crédits. La caisse se réconcilie ainsi
   toujours au franc près.
4. Effets différés, via `outbox_events` : commissions (`commission_entries`), décrément du stock
   (`stock_movements`), points de fidélité, reçu WhatsApp.

Une vente payée ne se modifie plus : on l'annule (`VOIDED`, motif obligatoire) ou on émet un avoir
(`invoices.type = CREDIT_NOTE`).

### Stock

- `product_stocks` porte la quantité courante **par salon**.
- `stock_movements` est le journal : réception, vente, consommation en prestation, transfert, inventaire,
  casse. Il est en ajout seul.
- Les quantités sont décimales pour gérer les ml et les g des produits techniques.
- `service_consumptions` décrit ce qu'une prestation consomme (ex. 1 paquet de mèches), pour décrémenter
  le stock automatiquement.

### Dépenses

- `expenses` : salon, catégorie paramétrable, fournisseur éventuel, justificatif scanné.
- Une dépense payée **en espèces** doit être rattachée à la session de caisse, pour que l'écart de caisse
  soit juste.
- Une dépense peut être liée à une commande fournisseur ou à une période de paie.

---

## 5. Garanties vérifiées

`prisma/sql/verification.sql` a été exécuté sur PostgreSQL 16 avec le rôle `salons_app` (soumis à RLS).
Les 9 contrôles passent :

| # | Contrôle |
|---|---|
| 1 | Clé composite : un RDV du tenant A ne peut pas pointer vers un salon du tenant B |
| 2 | Sans contexte tenant, aucune ligne visible |
| 3 | Le tenant A ne lit ni ne modifie les données du tenant B |
| 4 | Le tenant A ne peut pas écrire une ligne portant l'identifiant du tenant B |
| 5 | Deux occupations qui se chevauchent pour un même coiffeur sont refusées ; des créneaux contigus sont acceptés |
| 6 | Une occupation annulée libère le créneau |
| 7 | Une écriture déséquilibrée au registre est refusée |
| 8 | Le journal d'audit n'est pas modifiable |
| 9 | Un utilisateur voit ses propres adhésions dans tous les tenants, mais rien d'autre hors contexte |

Autres vérifications faites :
- `prisma migrate diff` entre la base migrée et le schéma ne renvoie **aucune différence** : les futures
  migrations Prisma ne tenteront pas d'annuler le SQL personnalisé ;
- le client Prisma se génère et se type correctement.

---

## 6. Installation sur une base vide

```bash
cd salons-saas/apps/api

# 1. Migrations, avec le rôle propriétaire des tables
DATABASE_URL="postgresql://salons_owner:...@hote:5432/salons" npx prisma@6.19.3 migrate deploy

# 2. Rôles de connexion (une seule fois, en superutilisateur)
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
     -v app_password="'...'" -v platform_password="'...'" -f prisma/sql/roles.sql

# 3. Contrôle des garanties (sur une base de test)
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/verification.sql
```

L'API se connecte ensuite avec `salons_app`. Chaque transaction commence par :
`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`.

---

## 7. Points d'attention pour la suite

- **`prisma migrate dev`** : la colonne générée `slot` est déclarée `@default(dbgenerated(...))` pour que
  Prisma la reconnaisse. Ne pas régénérer la migration `init` à partir de zéro : elle fait partie de
  l'historique.
- **Montants en `BigInt`** : l'API devra convertir ces valeurs avant de les envoyer en JSON (en nombre si
  la valeur reste sûre, sinon en chaîne). Ce sera un intercepteur global.
- **Numérotation** : ventes, factures et commandes utilisent `document_sequences`, incrémenté dans la même
  transaction que le document. La numérotation reste ainsi continue par tenant et par année.
- **Données chiffrées** : `client_technical_notes.content_enc`, `users.mfa_secret_enc` et
  `webhook_endpoints.secret_enc` sont chiffrées par l'application (clé du tenant `tenants.data_key_enc`).
  PostgreSQL ne voit jamais le texte clair.
