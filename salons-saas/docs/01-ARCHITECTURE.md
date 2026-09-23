# Plateforme SaaS multi-tenant de gestion de salons de coiffure — Architecture

> Nom de code technique : **`salons-saas`** (nom commercial à définir).
>
> Ce document ne contient **aucun code applicatif**. Il fixe la stack, le modèle multi-tenant, la base
> de données, les rôles, les permissions, les modules et la sécurité **avant** tout développement.
> Les points marqués **⚠️ À valider** attendent une décision de votre part (récapitulés au §11).

---

## 0. Ce que l'analyse du dépôt apporte au projet

Le dépôt contient déjà deux plateformes en production-ready construites sur la même stack. Le SaaS
salons doit **réutiliser ce qui a fait ses preuves** et **corriger ce qui ne passe pas à l'échelle
multi-tenant**.

### 0.1 Existant

| Élément | Laverie (`backend/`, `frontend/`) | Allô-Coursier (`allo-coursier/`) |
|---|---|---|
| API | NestJS 10 + Prisma 6 + PostgreSQL | NestJS 10 + Prisma 6 + PostgreSQL + Socket.io |
| Web | Next.js 14 PWA, React Query, Tailwind | Next.js 14 PWA, Leaflet |
| Organisation du code | 2 dossiers séparés | Monorepo npm workspaces (`apps/api`, `apps/web`) |
| Autorisations | `@Roles(RoleName.X)` codés en dur ; tables `permissions` présentes **mais inutilisées** | Catalogue de **permissions** (`common/permissions.ts`), rôles modifiables, **périmètre par ville** (`assertCityAccess`, `cityFilter`) |
| Durcissement HTTP | ValidationPipe uniquement | `helmet`, `@nestjs/throttler`, `compression`, validation des variables d'environnement |
| Paiements | Interface `PaymentGateway` + connecteurs **CinetPay** et **LigdiCash** | Mobile Money « manuel » validé par un opérateur, portefeuille, registre |
| Documents | PDF via `pdf-lib`, `NumberingService` (séquences) | — |
| Notifications | Web Push (VAPID), liens WhatsApp | Web Push, temps réel Socket.io |
| Hébergement | — | Docker Compose + Caddy (HTTPS auto) + scripts de sauvegarde sur un VPS |
| Jetons côté web | `localStorage` | `localStorage` |

### 0.2 Ce qu'on reprend tel quel

- La **stack** (NestJS / Prisma / PostgreSQL / Next.js PWA) : l'équipe la maîtrise, elle tourne sur un
  VPS à quelques euros par mois, sans dépendance à un cloud étranger facturé en devises.
- Le **catalogue de permissions** d'Allô-Coursier (codes `module.action`, rôles éditables) — généralisé
  au multi-tenant.
- Le **périmètre** « ville » d'Allô-Coursier → devient le périmètre « **salon** » (un gérant limité à son
  salon).
- L'interface `PaymentGateway` et les connecteurs CinetPay / LigdiCash ; le Mobile Money manuel.
- `pdf-lib` pour factures et reçus ; le principe de `NumberingService` (à rendre **par tenant**).
- L'infra Docker + Caddy + sauvegardes.

### 0.3 Ce qu'on ne reprend pas (et pourquoi)

| Point de l'existant | Problème en SaaS | Décision |
|---|---|---|
| Autorisation par nom de rôle codé en dur | Chaque salon veut ajuster ses rôles ; impossible sans redéployer | Autorisation **uniquement par permission** (§5) |
| Aucune notion de tenant | Fuite de données entre salons concurrents = risque n°1 d'un SaaS | Isolation en **3 couches** (§3.3) |
| `Sequence` globale, numéros `NK-...` | Les numéros de facture doivent être continus **par entreprise** | Séquences par `(tenant, type, année)` |
| Rate-limit en mémoire (`AssistantService`) | Faux dès qu'il y a 2 instances de l'API | Throttler adossé à **Redis** |
| Jetons en `localStorage` | Volables par n'importe quel script injecté (XSS) | Refresh token en **cookie httpOnly** (§8.2) |
| `Role.name` unique globalement, `User.phone` rattaché à un seul rôle | Un coiffeur peut travailler dans 2 salons ; un client réserve dans plusieurs | Identité globale + **adhésions par tenant** (§3.2) |

---

## 1. Périmètre fonctionnel en une phrase

Un **propriétaire de salon** s'inscrit, choisit un abonnement, configure son ou ses salons (horaires,
équipe, prestations, prix), puis gère **agenda, réservations en ligne, caisse, clients, stock,
commissions et statistiques** ; ses **clients** réservent et paient depuis une page publique ou une PWA ;
l'**éditeur de la plateforme** administre les tenants, les offres et la facturation SaaS.

Réalités terrain à intégrer dès la conception (Burkina Faso / Afrique de l'Ouest, marché de départ
supposé — ⚠️ À valider) :

| Réalité | Conséquence technique |
|---|---|
| Beaucoup de clients arrivent **sans rendez-vous** | File d'attente « walk-in » au même niveau que l'agenda |
| Coiffure afro : prestations **longues** (tresses, tissages : 3 à 8 h), **temps de pose** | Une prestation = séquence d'étapes « occupé / libre », le coiffeur peut servir un autre client pendant la pose |
| Mèches, extensions fournies par le salon ou le client | Ligne « produit consommé » facultative sur la prestation, prix variable |
| Espèces et Mobile Money dominants | Caisse avec fond de caisse et clôture ; Mobile Money manuel dès le jour 1 |
| Réseau instable, Android d'entrée de gamme | PWA légère, lecture hors ligne de l'agenda du jour, file d'actions rejouées |
| Téléphone = identité ; WhatsApp = canal principal | Connexion par téléphone ; rappels WhatsApp/SMS via connecteurs |
| FCFA sans centimes | Montants en **entiers** |

---

## 2. Stack technique

| Couche | Choix | Justification |
|---|---|---|
| Monorepo | **npm workspaces** : `apps/api`, `apps/web`, `packages/shared` (types, catalogue de permissions, schémas Zod partagés) | Même organisation qu'Allô-Coursier ; un seul catalogue de permissions pour l'API et l'interface |
| API | **NestJS 10** (TypeScript), REST versionnée `/api/v1`, OpenAPI/Swagger | Un module Nest par module métier ; DI pour injecter le contexte tenant |
| ORM | **Prisma 6** + **extension client** qui injecte `tenantId` | Migrations versionnées, schéma lisible ; l'extension évite d'oublier le filtre tenant |
| Base de données | **PostgreSQL 16** avec **Row-Level Security**, `btree_gist` (contrainte anti-chevauchement des rendez-vous), `citext`, `pgcrypto` | RLS = filet de sécurité en base ; `EXCLUDE USING gist` empêche le double-booking même en cas de requêtes concurrentes |
| Cache, files, verrous | **Redis 7** + **BullMQ** | Rappels de RDV, envois SMS/WhatsApp, génération PDF, calcul des commissions, relances : tâches différées et réessayables ; rate-limit partagé |
| Temps réel | **Socket.io** (adapter Redis), une *room* par salon | Agenda et file d'attente mis à jour instantanément sur tous les postes du salon |
| Web | **Next.js 14 (App Router)** + TypeScript + Tailwind + React Query + React Hook Form + Zod | Stack déjà utilisée ; une seule app, trois espaces (§6.3) |
| Mobile | **PWA** installable (service worker, IndexedDB) ; empaquetage Play Store ultérieur via TWA/Capacitor si besoin | Pas de 2ᵉ base de code tant que la PWA suffit |
| Fichiers | Stockage **S3-compatible** (MinIO sur le VPS au départ, puis Scaleway/Backblaze/R2), **bucket privé**, URL signées | Photos avant/après, logos, pièces justificatives ; jamais servis en accès public direct |
| PDF | **pdf-lib** (repris de la laverie), exécuté dans un worker BullMQ | Léger, sans Chromium |
| Paiements | Interface `PaymentGateway` (reprise) : Espèces, Mobile Money manuel, **CinetPay**, **LigdiCash** ; Stripe/carte plus tard si hors zone UEMOA | Aucun contrat nécessaire pour démarrer |
| Messages | Interfaces `SmsProvider`, `WhatsAppProvider` (Cloud API Meta), `EmailProvider` (SMTP), Web Push (VAPID) | Chaque canal est un connecteur activable par réglage |
| Assistant IA (optionnel) | Module `assistant` repris de la laverie (API Claude) avec quotas **par tenant** | Réponses aux questions clients sur la page de réservation |
| Observabilité | Logs JSON (pino) sans données personnelles, **Sentry** (erreurs), **Uptime Kuma** (disponibilité), métriques Prometheus/Grafana en phase 2 | |
| Hébergement | **VPS + Docker Compose + Caddy** (HTTPS Let's Encrypt, certificats à la demande pour domaines personnalisés) ; migration vers 2+ nœuds derrière un load balancer quand la charge l'exige | Coût maîtrisé ; l'API est sans état donc scalable horizontalement |
| CI/CD | GitHub Actions : lint, typecheck, tests unitaires, **tests d'isolation tenant**, build des images, migration puis déploiement | |

### 2.1 Vue d'ensemble

```
                   *.plateforme.bf  /  domaine-du-salon.com
                                  │  HTTPS
                          ┌───────▼────────┐
                          │     Caddy      │  TLS, domaines perso, compression
                          └──┬──────────┬──┘
                             │          │
                 ┌───────────▼──┐   ┌───▼──────────────────────────────┐
                 │  apps/web    │   │  apps/api (NestJS, sans état)     │
                 │  Next.js PWA │──▶│  ┌──────────────────────────────┐ │
                 │  - réservation│  │  │ TenantContext (AsyncLocal)   │ │
                 │  - back-office│  │  │ AuthGuard → PermissionGuard  │ │
                 │  - console    │  │  │ Modules métier               │ │
                 │    plateforme │  │  └──────────────────────────────┘ │
                 └──────────────┘   │  Socket.io gateway (rooms salon)  │
                                    └───┬───────────┬────────────┬──────┘
                                        │           │            │
                          ┌─────────────▼──┐  ┌─────▼─────┐ ┌────▼───────────┐
                          │ PostgreSQL 16  │  │  Redis    │ │ Stockage S3    │
                          │ RLS par tenant │  │  BullMQ   │ │ (bucket privé) │
                          └────────────────┘  └─────┬─────┘ └────────────────┘
                                                    │
                                          ┌─────────▼──────────┐
                                          │ apps/api (worker)  │  rappels, SMS/WhatsApp,
                                          │ même code, autre   │  PDF, commissions,
                                          │ point d'entrée     │  facturation SaaS, exports
                                          └─────────┬──────────┘
                                                    │
                      CinetPay · LigdiCash · WhatsApp Cloud API · SMS · SMTP · Web Push
```

### 2.2 Arborescence cible

```
salons-saas/
├── apps/
│   ├── api/
│   │   ├── prisma/                 schema.prisma, migrations/, sql/rls/ (policies RLS versionnées)
│   │   └── src/
│   │       ├── main.ts             serveur HTTP
│   │       ├── worker.ts           consommateurs BullMQ
│   │       ├── core/               tenancy/, auth/, permissions/, audit/, config/, prisma/, storage/
│   │       ├── platform/           tenants/, plans/, saas-billing/, support/, feature-flags/
│   │       └── modules/            un dossier par module métier (§6)
│   └── web/
│       └── app/
│           ├── (public)/[salon]/   page de réservation, avis
│           ├── (client)/           espace client
│           ├── (pro)/              back-office salon
│           └── (platform)/         console éditeur
├── packages/shared/                permissions, enums, schémas Zod, utilitaires monétaires
├── infra/                          docker-compose*.yml, Caddyfile, backup/
└── docs/
```

---

## 3. Modèle multi-tenant

### 3.1 Stratégie retenue : base partagée, schéma partagé, colonne `tenant_id` + RLS

| Option | Isolation | Coût / exploitation | Verdict |
|---|---|---|---|
| Une base par tenant | Maximale | Des milliers de petites bases, migrations N fois, coût élevé | ❌ inadapté à des salons à petit budget |
| Un schéma PostgreSQL par tenant | Forte | Migrations N fois, Prisma gère mal les schémas dynamiques | ❌ |
| **Schéma partagé + `tenant_id` + RLS** | Forte si les 3 couches sont en place | Une migration, un pool de connexions, coût marginal par salon ≈ 0 | ✅ **retenu** |

Porte de sortie prévue : la table `tenants` porte un champ `data_region`/`shard`. Un très gros client
(chaîne de 50 salons) pourra être déplacé vers une base dédiée sans changer le code applicatif.

### 3.2 Hiérarchie des entités

```
Plateforme (éditeur)
 └── Tenant  = l'entreprise cliente (ex. « Beauté Divine SARL »), porte l'abonnement SaaS
      └── Salon  = un établissement physique (adresse, horaires, caisse, fuseau horaire)
           └── Postes / ressources (fauteuils, bacs, cabines)

Utilisateur (identité globale : téléphone, mot de passe, MFA)
 ├── Membership (user × tenant) → rôle(s) + périmètre salons   ← personnel
 └── ClientProfile (user × tenant) → fiche CRM du tenant       ← client final
```

- **L'identité est globale, les données sont au tenant.** Un même numéro peut être coiffeur chez A et
  client chez B. La fiche client (historique, notes, formules de coloration) **appartient au salon** et
  n'est jamais visible d'un autre tenant.
- Un client peut exister **sans compte** (créé au comptoir) : `client_profiles.user_id` est facultatif
  et se rattache quand le client s'inscrit avec le même numéro vérifié.

### 3.3 Isolation en trois couches

1. **Contexte tenant** — Un middleware résout le tenant puis le place dans un `AsyncLocalStorage` :
   - back-office et API authentifiée : `tenantId` **tiré du jeton**, jamais d'un en-tête ou d'un paramètre
     fourni par le navigateur ; changement de tenant = nouveau jeton émis après vérification de l'adhésion ;
   - pages publiques : résolution par sous-domaine `{slug}.plateforme.bf`, domaine personnalisé
     (table `tenant_domains`) ou chemin `/s/{slug}`.
2. **Couche applicative** — Une extension Prisma ajoute automatiquement `where tenantId = ctx` à toutes
   les lectures, et `tenantId` à toutes les écritures, sur les modèles marqués « tenant ». Les requêtes SQL
   brutes sont interdites hors d'un répertoire revu (`core/prisma/raw/`), vérifié par une règle de lint.
3. **Couche base de données** — **Row-Level Security** sur chaque table tenant :
   `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. Chaque requête s'exécute dans une
   transaction qui fait `SET LOCAL app.tenant_id = ...`. L'API se connecte avec un rôle PostgreSQL
   **sans `BYPASSRLS`** ; seuls les migrations et les tâches plateforme utilisent un rôle distinct.

Garanties complémentaires :
- toutes les clés étrangères entre tables tenant sont **composites** `(tenant_id, id)` → impossible de
  rattacher un rendez-vous du tenant A à un client du tenant B, même par bug ;
- **tests d'isolation obligatoires en CI** : pour chaque route, un utilisateur du tenant A tente de lire,
  modifier et supprimer une ressource du tenant B → attendu 404 ;
- les identifiants sont des **UUID v7** (non devinables, triables dans le temps).

### 3.4 Cycle de vie d'un tenant

`TRIAL → ACTIVE → PAST_DUE → SUSPENDED (lecture seule) → CANCELLED → PURGED`

- Essai gratuit (durée ⚠️ À valider, ex. 30 jours), sans moyen de paiement.
- Impayé : relances, puis **lecture seule** (le salon voit ses données et peut les exporter mais ne crée
  plus de rendez-vous) — on ne coupe jamais brutalement l'accès aux données d'un client.
- Résiliation : export complet (CSV + PDF des factures) proposé, purge définitive après le délai
  légal de conservation des pièces comptables (factures conservées, données clients anonymisées).

---

## 4. Base de données

### 4.1 Conventions

| Règle | Détail |
|---|---|
| Clés | `id uuid` (v7) ; toute table tenant a `tenant_id uuid not null` en **première colonne des index** |
| Horodatage | `timestamptz` en UTC ; le **fuseau du salon** (`salons.timezone`, ex. `Africa/Ouagadougou`) sert à l'affichage et aux horaires |
| Argent | `bigint` en **unité mineure de la devise** + `currency char(3)` (XOF : 1 unité = 1 FCFA) ; jamais de `float` |
| Suppression | `deleted_at` (suppression logique) sur les données de référence ; les pièces comptables ne sont **jamais** supprimées, seulement annulées par un avoir |
| Figement | Le prix, la durée et le taux de commission sont **copiés** dans la ligne de rendez-vous/vente : modifier un tarif ne réécrit jamais le passé |
| Unicité | Toujours **par tenant** : `unique(tenant_id, phone)` pour les clients, `unique(tenant_id, number)` pour les factures |
| Concurrence | Colonne `version int` (verrouillage optimiste) sur rendez-vous, caisse, stock |
| Audit | Colonnes `created_by`, `updated_by` + table `audit_logs` en ajout seul |

### 4.2 Tables — niveau plateforme (sans `tenant_id`, pas de RLS)

| Table | Contenu principal |
|---|---|
| `users` | identité globale : téléphone (unique, vérifié), email, `password_hash`, `mfa_secret` (chiffré), statut, dernière connexion |
| `user_sessions` | refresh tokens hachés, famille de rotation, appareil, IP, expiration, révocation |
| `platform_staff` | employés de l'éditeur et leur rôle plateforme |
| `plans` | offres (Solo, Salon, Multi-salons…) : prix mensuel/annuel, **limites** (salons, employés, SMS/mois, stockage) |
| `plan_features` | fonctionnalités activées par offre (`online_booking`, `stock`, `commissions`, `multi_salon`, `custom_roles`, `api_access`…) |
| `tenants` | raison sociale, `slug`, pays, devise, statut du cycle de vie, `plan_id`, `trial_ends_at`, `shard` |
| `tenant_domains` | domaines personnalisés + statut de vérification DNS |
| `saas_subscriptions`, `saas_invoices`, `saas_payments` | facturation de l'éditeur vers le tenant |
| `usage_counters` | consommation par tenant et période (SMS, stockage, rendez-vous) pour les quotas |
| `feature_overrides` | activation manuelle d'une fonction pour un tenant (bêta, geste commercial) |
| `permissions` | catalogue global des codes de permission (synchronisé depuis `packages/shared`) |
| `impersonation_grants` | accès support accordé par un propriétaire : durée, motif, périmètre |

### 4.3 Tables — niveau tenant (avec `tenant_id` + RLS)

**Organisation et accès**

| Table | Contenu principal |
|---|---|
| `salons` | nom, adresse, GPS, téléphone, fuseau, devise, statut, paramètres de réservation (délai minimal, annulation, acompte) |
| `salon_opening_hours` | jour, plages d'ouverture |
| `salon_closures` | fermetures exceptionnelles, jours fériés |
| `resources` | fauteuils, bacs, cabines (capacité, salon) |
| `roles` | rôles du tenant (`is_system` pour les rôles par défaut non supprimables) |
| `role_permissions` | rôle × code de permission |
| `memberships` | user × tenant : statut (invité, actif, suspendu), `all_salons bool` |
| `membership_roles` | adhésion × rôle |
| `membership_salons` | périmètre : salons auxquels l'adhésion donne accès |
| `invitations` | invitations d'employés (jeton haché, expiration) |

**Équipe**

| Table | Contenu principal |
|---|---|
| `staff_members` | profil professionnel (lié à une adhésion) : nom affiché, photo, couleur d'agenda, réservable en ligne, type de contrat |
| `staff_skills` | prestations que le coiffeur sait faire + durée/prix spécifiques éventuels (un senior peut être plus cher) |
| `staff_schedules` | planning type par salon et jour de semaine |
| `staff_time_off` | congés, absences, pauses |
| `time_clock_entries` | pointage arrivée/départ (optionnel) |

**Catalogue**

| Table | Contenu principal |
|---|---|
| `service_categories` | coupe, coloration, tresses, tissage, soins, barbe… |
| `services` | nom, description, prix de base, **prix « à partir de »**, réservable en ligne, acompte exigé, ressource requise |
| `service_variants` | variante (cheveux courts/mi-longs/longs, taille des tresses…) avec prix et durée propres |
| `service_steps` | étapes ordonnées : durée + `blocks_staff` (vrai = coiffeur occupé, faux = temps de pose) + ressource |
| `service_packages` | forfaits combinant plusieurs prestations |

**Agenda et réservation**

| Table | Contenu principal |
|---|---|
| `appointments` | client, salon, canal (en ligne, comptoir, téléphone, WhatsApp), statut, total estimé, acompte, notes |
| `appointment_items` | prestation + variante, coiffeur, **créneau** `tstzrange`, prix et durée figés |
| `staff_busy_slots` | occupation matérialisée par étape bloquante : `EXCLUDE USING gist (tenant_id WITH =, staff_id WITH =, slot WITH &&)` → **double-booking impossible en base** |
| `resource_busy_slots` | même principe pour les fauteuils/bacs |
| `appointment_status_history` | transitions : qui, quand, motif |
| `waitlist_entries` | file d'attente sans rendez-vous : arrivée, prestation souhaitée, coiffeur préféré, position, statut |
| `booking_holds` | réservation temporaire d'un créneau pendant le paiement de l'acompte (expire au bout de ~10 min) |

Statuts d'un rendez-vous :
`PENDING (attente acompte ou validation) → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED`, plus
`CANCELLED_BY_CLIENT`, `CANCELLED_BY_SALON`, `NO_SHOW`.

**Clients (CRM)**

| Table | Contenu principal |
|---|---|
| `client_profiles` | nom, téléphone, WhatsApp, email, date de naissance, genre (facultatif), `user_id` facultatif, salon préféré, coiffeur préféré, tags, statistiques dénormalisées (dernière visite, CA cumulé, nb de no-show) |
| `client_consents` | consentements horodatés : marketing SMS/WhatsApp/email, photos, conservation de la fiche technique |
| `client_technical_notes` | **fiche technique** : formules de coloration, type de cheveux, **allergies / sensibilités** (champ chiffré, §8.5) |
| `client_photos` | photos avant/après (clé de stockage, consentement lié) |
| `client_notes` | notes internes datées |

**Ventes, caisse et paiements**

| Table | Contenu principal |
|---|---|
| `sales` | ticket de caisse : salon, client, rendez-vous lié, statut (ouvert, payé, annulé), totaux, remise, pourboires |
| `sale_items` | prestation ou produit, coiffeur crédité, quantité, prix unitaire figé, remise, taux de commission figé |
| `payments` | vente, moyen (espèces, Mobile Money manuel, CinetPay, LigdiCash, carte cadeau, crédit client), montant, référence opérateur, statut, validé par |
| `payment_transactions` | échanges avec l'agrégateur : jeton, statut, payload brut, **clé d'idempotence** |
| `refunds` | remboursements liés à un paiement |
| `cash_registers` | caisses physiques par salon |
| `cash_sessions` | ouverture (fond de caisse), clôture (compté vs attendu, écart, justifié par) |
| `cash_movements` | entrées/sorties hors vente (dépense payée en espèces, dépôt en banque) |
| `invoices`, `invoice_lines` | factures et avoirs, numéro séquentiel **par tenant et par année**, PDF archivé, figés après émission |
| `document_sequences` | `(tenant_id, type, year) → valeur`, incrément transactionnel |
| `ledger_entries` | écriture en partie double de chaque mouvement d'argent (vente, paiement, remboursement, carte cadeau) pour que la caisse soit toujours réconciliable |

**Stock**

| Table | Contenu principal |
|---|---|
| `products` | produit de **revente** ou **technique** (consommé en prestation), code-barres, prix d'achat, prix de vente, seuil d'alerte |
| `product_stock` | quantité par salon |
| `stock_movements` | entrée, vente, consommation, transfert entre salons, ajustement d'inventaire, casse — avec motif et auteur |
| `suppliers`, `purchase_orders`, `purchase_order_lines` | fournisseurs et commandes |
| `service_consumptions` | consommation type d'un produit par prestation (ex. 1 paquet de mèches) |

**Commissions et paie**

| Table | Contenu principal |
|---|---|
| `commission_rules` | par coiffeur/rôle/catégorie : % ou montant fixe, sur prestations et/ou produits, paliers |
| `commission_entries` | commission calculée par ligne de vente (figée) |
| `payroll_periods` | période, total prestations, commissions, avances, statut (brouillon, validée, payée) |
| `staff_advances` | avances sur salaire |

**Fidélité et marketing**

| Table | Contenu principal |
|---|---|
| `loyalty_programs`, `loyalty_transactions` | points gagnés/dépensés, règles |
| `gift_cards`, `gift_card_transactions` | cartes cadeaux (code haché, solde) |
| `prepaid_packages`, `client_packages` | carnets (ex. 10 brushings, 5 utilisés) |
| `promotions` | codes promo, remises, période, conditions |
| `campaigns`, `campaign_recipients` | campagnes SMS/WhatsApp/email, segments, statistiques d'envoi |
| `notification_templates` | modèles de message par événement et par canal (rappel J-1, confirmation, anniversaire…) |
| `notifications` | journal des envois : canal, destinataire, statut, coût |
| `push_subscriptions` | abonnements Web Push |

**Qualité, pilotage et technique**

| Table | Contenu principal |
|---|---|
| `reviews` | avis clients après visite (note, commentaire, réponse du salon, publié ou non) |
| `complaints` | réclamations |
| `expenses` | dépenses du salon (loyer, électricité, salaires…) |
| `tenant_settings` | paramètres clé/valeur typés |
| `webhook_endpoints` | webhooks sortants (offre API) |
| `api_keys` | clés d'API du tenant (hachées, permissions restreintes) |
| `audit_logs` | ajout seul : acteur, tenant, action, entité, avant/après, IP, *user-agent*, `impersonated_by` |
| `outbox_events` | événements métier à publier (rendez-vous créé, vente payée) → garantit qu'un rappel ou une commission n'est jamais perdu |

### 4.4 Index et performances clés

- `appointments (tenant_id, salon_id, start_at)`, `appointment_items (tenant_id, staff_id, slot)` (GiST).
- `client_profiles (tenant_id, phone)` unique, + index trigramme `pg_trgm` sur le nom pour la recherche au comptoir.
- `sales (tenant_id, salon_id, created_at)`, `payments (tenant_id, status)`.
- Statistiques lourdes : **vues matérialisées** journalières par tenant (CA, taux d'occupation), rafraîchies par le worker.
- Partitionnement mensuel de `audit_logs` et `notifications` quand le volume le justifiera.

---

## 5. Rôles et permissions

### 5.1 Principes

1. **Le code ne teste jamais un nom de rôle, seulement une permission** : `@RequirePermission('appointments.manage')`.
2. Permission effective = (permissions des rôles de l'adhésion) **∩** (fonctionnalités de l'offre du
   tenant) **∩** (périmètre salons) **∩** (règle « les miennes » quand elle s'applique).
3. Les rôles système sont fournis par défaut et **modifiables** par le propriétaire ; les **rôles
   personnalisés** sont disponibles selon l'offre (`custom_roles`).
4. Trois dimensions de portée :
   - **tenant** : toujours implicite ;
   - **salon** : `membership_salons` (un gérant ne voit que son salon) ;
   - **propriété** : suffixe `.own` (un coiffeur ne voit que son agenda et ses commissions).
5. Le catalogue des permissions vit dans `packages/shared` : l'API l'applique, l'interface s'en sert pour
   afficher ou masquer les menus. **L'interface n'est jamais une barrière de sécurité**, seule l'API l'est.

### 5.2 Rôles plateforme (éditeur)

| Rôle | Mission | Accès aux données des salons |
|---|---|---|
| `PLATFORM_OWNER` | Tout, y compris les offres et les rôles plateforme | Uniquement via accès support accordé |
| `PLATFORM_SUPPORT` | Assistance aux salons | **Lecture seule**, uniquement avec un `impersonation_grant` accordé par le propriétaire du salon, limité dans le temps et journalisé |
| `PLATFORM_BILLING` | Facturation SaaS, relances, avoirs | Aucune donnée métier, seulement abonnement et factures SaaS |

### 5.3 Rôles d'un tenant (par défaut)

| Rôle | Pour qui | Portée |
|---|---|---|
| `OWNER` | Propriétaire. Au moins un par tenant, non supprimable | Tous les salons, abonnement SaaS |
| `MANAGER` | Gérant d'un ou plusieurs salons | Salons assignés |
| `RECEPTIONIST` | Accueil, caisse, prise de RDV | Salons assignés |
| `STYLIST` | Coiffeur, barbier, esthéticienne | Son agenda, ses clients du jour, ses ventes |
| `ACCOUNTANT` | Comptable interne ou cabinet externe | Lecture finances, exports ; aucune donnée santé ni photo |
| `CLIENT` | Client final (pas une adhésion : un `client_profile` lié à un `user`) | Ses propres rendez-vous, factures, fidélité |

### 5.4 Catalogue des permissions

| Groupe | Codes |
|---|---|
| Salons & paramètres | `salons.read`, `salons.manage`, `settings.manage`, `integrations.manage` |
| Équipe | `staff.read`, `staff.manage`, `staff.schedule.manage`, `roles.manage`, `timeclock.use`, `timeclock.manage` |
| Catalogue | `services.read`, `services.manage`, `prices.manage` |
| Agenda | `appointments.read.own`, `appointments.read`, `appointments.create`, `appointments.manage`, `appointments.cancel`, `waitlist.manage` |
| Clients | `clients.read.basic` (nom, téléphone), `clients.read`, `clients.manage`, `clients.technical.read`, `clients.technical.manage`, `clients.photos.manage`, `clients.export`, `clients.delete` |
| Caisse & ventes | `sales.create`, `sales.discount` (jusqu'à un plafond paramétrable), `sales.void`, `payments.record`, `payments.validate` (Mobile Money manuel), `refunds.create`, `cash.session.open_close`, `cash.movements.manage` |
| Facturation | `invoices.read`, `invoices.issue`, `invoices.credit_note` |
| Stock | `stock.read`, `stock.adjust`, `stock.transfer`, `purchases.manage` |
| Commissions & paie | `commissions.read.own`, `commissions.read`, `commissions.rules.manage`, `payroll.manage` |
| Marketing | `loyalty.manage`, `giftcards.manage`, `promotions.manage`, `campaigns.send` |
| Qualité | `reviews.reply`, `complaints.manage` |
| Pilotage | `reports.read.own`, `reports.read`, `reports.finance.read`, `expenses.manage`, `audit.read` |
| Compte SaaS | `billing.manage` (offre, moyens de paiement SaaS), `data.export`, `support.grant` |

### 5.5 Matrice par défaut

✅ = accordé · 🔸 = limité (`.own` ou plafonné) · — = refusé

| Permission | OWNER | MANAGER | RECEPTIONIST | STYLIST | ACCOUNTANT |
|---|:-:|:-:|:-:|:-:|:-:|
| Salons, paramètres, intégrations | ✅ | 🔸 lecture + horaires de son salon | — | — | — |
| Équipe & plannings | ✅ | ✅ (ses salons) | lecture | lecture | — |
| Rôles & permissions | ✅ | — | — | — | — |
| Catalogue & prix | ✅ | ✅ | lecture | lecture | lecture |
| Agenda | ✅ | ✅ | ✅ | 🔸 le sien (+ lecture du salon pour trouver un créneau) | — |
| File d'attente | ✅ | ✅ | ✅ | ✅ | — |
| Clients : fiche de base | ✅ | ✅ | ✅ | 🔸 clients de ses RDV | — |
| Clients : fiche technique / allergies | ✅ | ✅ | lecture | ✅ (clients de ses RDV) | — |
| Clients : export / suppression | ✅ | — | — | — | — |
| Encaissement | ✅ | ✅ | ✅ | 🔸 selon réglage du salon | — |
| Remises | ✅ | ✅ | 🔸 plafonnées | — | — |
| Annulation de vente / remboursement | ✅ | ✅ | — | — | — |
| Validation Mobile Money manuel | ✅ | ✅ | ✅ | — | — |
| Ouverture / clôture de caisse | ✅ | ✅ | ✅ | — | lecture |
| Factures & avoirs | ✅ | ✅ | émission | — | lecture |
| Stock | ✅ | ✅ | lecture + vente | consommation | lecture |
| Commissions | ✅ | ✅ (ses salons) | — | 🔸 les siennes | lecture |
| Paie | ✅ | — | — | — | ✅ |
| Marketing & campagnes | ✅ | ✅ | — | — | — |
| Statistiques | ✅ | ✅ (ses salons) | 🔸 du jour | 🔸 les siennes | finances |
| Dépenses | ✅ | ✅ | 🔸 saisie | — | ✅ |
| Journal d'audit | ✅ | — | — | — | lecture |
| Abonnement SaaS, export global, accès support | ✅ | — | — | — | — |

### 5.6 Mécanique dans l'API

1. `JwtAuthGuard` : vérifie le jeton d'accès (15 min) contenant `sub`, `tid` (tenant), `mid` (adhésion),
   `perms` (codes effectifs), `salons` (`null` = tous), `pv` (version des permissions).
2. `TenantGuard` : place `tid` dans le contexte et ouvre la transaction avec `SET LOCAL app.tenant_id`.
3. `PermissionGuard` : compare la permission requise par la route avec `perms`.
4. Dans le service : `assertSalonAccess(user, salonId)` / `salonFilter(user)` (généralisation directe de
   `assertCityAccess` / `cityFilter` d'Allô-Coursier) et filtre `.own`.
5. **Révocation immédiate** : modifier un rôle ou suspendre une adhésion incrémente `pv` en Redis ; un
   jeton porteur d'une version périmée est refusé et doit être rafraîchi.

---

## 6. Modules

### 6.1 Modules plateforme (console éditeur)

| Module | Rôle |
|---|---|
| `tenants` | Inscription en libre-service (assistant : entreprise → premier salon → horaires → prestations types → invitation de l'équipe), cycle de vie, domaines personnalisés |
| `plans` & `feature-flags` | Offres, limites, fonctionnalités, dérogations |
| `saas-billing` | Abonnement mensuel/annuel, facturation, paiement Mobile Money/agrégateur, relances, passage en lecture seule |
| `usage` | Compteurs (SMS, stockage, employés) et blocage doux au dépassement |
| `support` | Accès support accordé et journalisé, notes internes, annonces aux salons |
| `templates` | Catalogues de prestations pré-remplis (coiffure afro, barbier, onglerie…) copiés à l'inscription |
| `platform-analytics` | MRR, churn, tenants actifs, adoption des fonctions |

### 6.2 Modules tenant (back-office salon)

| # | Module | Contenu | Phase |
|---|---|---|---|
| 1 | **Organisation** | Salons, horaires, fermetures, ressources, paramètres de réservation | MVP |
| 2 | **Équipe** | Profils, compétences, plannings, congés, invitations, rôles | MVP |
| 3 | **Catalogue** | Catégories, prestations, variantes, étapes et temps de pose, forfaits | MVP |
| 4 | **Agenda** | Vue jour/semaine par coiffeur, glisser-déposer, **moteur de disponibilité** (horaires ∩ planning ∩ compétences ∩ ressources − occupations), anti-double-booking en base, statuts, no-show | MVP |
| 5 | **File d'attente** | Enregistrement des clients sans RDV, estimation du temps d'attente, écran d'affichage salon, appel du suivant | MVP |
| 6 | **Réservation en ligne** | Page publique par salon, choix prestation → coiffeur (ou « peu importe ») → créneau, acompte, confirmation, annulation/modification par lien sécurisé, lien partageable sur WhatsApp/Facebook | MVP |
| 7 | **Clients (CRM)** | Fiche, historique, fiche technique, photos avant/après, consentements, tags, fusion des doublons | MVP |
| 8 | **Caisse** | Ticket depuis un RDV ou en vente directe, paiements multiples, pourboires, remises, ouverture/clôture avec écart, reçu PDF/WhatsApp | MVP |
| 9 | **Paiements** | Espèces, Mobile Money manuel, CinetPay/LigdiCash (webhooks), acomptes, remboursements | MVP |
| 10 | **Notifications** | Confirmation, rappel J-1 et H-2, remerciement + demande d'avis ; Web Push, WhatsApp, SMS, email selon connecteurs | MVP |
| 11 | **Statistiques** | Tableau de bord du jour, CA, panier moyen, taux d'occupation, performance par coiffeur, taux de retour client, no-show | MVP (base) |
| 12 | **Facturation** | Factures, avoirs, numérotation légale, exports comptables | v1 |
| 13 | **Stock** | Produits revente/technique, mouvements, inventaire, alertes, fournisseurs, transferts | v1 |
| 14 | **Commissions & paie** | Règles, calcul automatique à la vente, relevé par coiffeur, avances, périodes | v1 |
| 15 | **Fidélité & cartes cadeaux** | Points, carnets prépayés, cartes cadeaux | v1 |
| 16 | **Marketing** | Segments, campagnes, anniversaires, relance des clients inactifs, promotions | v2 |
| 17 | **Avis & réclamations** | Collecte après visite, réponse publique, suivi des réclamations | v2 |
| 18 | **Dépenses** | Charges du salon, résultat simplifié | v2 |
| 19 | **Multi-salons** | Vue consolidée, transferts de stock, clients partagés entre salons du même tenant | v2 |
| 20 | **API & webhooks** | Clés d'API, webhooks sortants pour les intégrateurs | v3 |
| 21 | **Assistant IA** | Réponses aux questions sur la page de réservation, aide à la rédaction de campagnes | v3 |

### 6.3 Espaces de l'application web

| Espace | Adresse | Public |
|---|---|---|
| Page de réservation | `{slug}.plateforme.bf` ou domaine personnalisé | Clients, sans connexion jusqu'à la confirmation |
| Espace client | `plateforme.bf/moi` | Clients connectés : RDV à venir et passés dans **tous** leurs salons, factures, fidélité |
| Back-office | `app.plateforme.bf` | Personnel ; sélecteur de tenant et de salon ; vue « comptoir » simplifiée pour tablette |
| Console éditeur | `admin.plateforme.bf` (accès restreint, MFA obligatoire) | Équipe de la plateforme |

### 6.4 Dépendances entre modules

```
Organisation ─┬─▶ Équipe ─┬─▶ Agenda ◀── Réservation en ligne
Catalogue ────┘           │      │
                          │      ▼
Clients ◀─────────────────┴── Caisse ──▶ Paiements ──▶ Facturation
                                 │
                                 ├──▶ Stock (consommations, ventes)
                                 ├──▶ Commissions
                                 └──▶ Fidélité
          Notifications ◀── événements (outbox) de tous les modules
          Statistiques  ◀── lecture seule sur tous les modules
```

Les modules communiquent par **appels de service** pour ce qui est synchrone (la caisse lit un rendez-vous)
et par **événements** (`outbox_events` → BullMQ) pour les effets secondaires (rappel, commission, points
de fidélité), afin qu'une panne d'un connecteur SMS ne bloque jamais un encaissement.

---

## 7. Flux critiques

### 7.1 Réservation en ligne avec acompte

1. Le client choisit prestation, coiffeur, créneau → l'API recalcule la disponibilité côté serveur
   (jamais confiance au créneau envoyé par le navigateur).
2. Création d'un `booking_hold` + lignes d'occupation dans **une transaction** ; la contrainte d'exclusion
   refuse le second client si deux réservent le même créneau à la même seconde.
3. Si acompte : redirection vers l'agrégateur ; le **webhook signé** confirme le paiement → rendez-vous
   `CONFIRMED`. Sans paiement avant expiration du `hold`, le créneau est libéré automatiquement.
4. Événement `appointment.confirmed` → confirmation WhatsApp/SMS/Push, rappels planifiés.

### 7.2 Encaissement

Ticket → lignes (prix figés, coiffeur crédité) → paiements (un ou plusieurs moyens) → écritures
`ledger_entries` → événements `sale.paid` → commissions, points, décrément de stock, reçu. Une vente
payée ne se modifie plus : correction = annulation + nouvelle vente, ou avoir.

### 7.3 Hors connexion (PWA)

- Lecture : agenda du jour, file d'attente et fiche de base des clients du jour mises en cache (IndexedDB,
  chiffré par une clé de session, purgé à la déconnexion).
- Écriture : check-in, début/fin de prestation, encaissement **en espèces** mis en file locale avec
  identifiant généré par l'appareil (idempotence) et rejoués au retour du réseau ; les conflits
  (créneau pris entre-temps) sont signalés, jamais écrasés silencieusement.
- Les paiements électroniques et les réservations nouvelles exigent le réseau.

---

## 8. Sécurité

### 8.1 Menaces prioritaires

| Menace | Parade |
|---|---|
| Un salon lit les données d'un concurrent | Isolation 3 couches (§3.3), FK composites, tests d'isolation en CI, revue de code obligatoire des requêtes SQL brutes |
| Vol de compte (propriétaire, support) | MFA, limitation des essais, alertes de connexion, sessions révocables |
| Employé malveillant (remises abusives, annulation de ventes encaissées en espèces) | Permissions fines, plafonds, annulations motivées et journalisées, clôture de caisse avec écart, rapport des annulations |
| Faux paiement (webhook forgé, référence Mobile Money inventée) | Signature vérifiée + re-vérification du statut auprès de l'agrégateur ; validation humaine du Mobile Money manuel, contrôle d'unicité de la référence |
| Fuite de données sensibles (allergies, photos) | Chiffrement applicatif, bucket privé, URL signées courtes, permissions dédiées |
| Abus des envois SMS/WhatsApp (coût) | Quotas par tenant, rate-limit, validation des numéros, pas d'envoi libre depuis les pages publiques |
| Robots sur la réservation en ligne (faux RDV) | Rate-limit par IP et par numéro, vérification OTP du téléphone quand un fournisseur SMS est actif, acompte configurable, liste noire de no-show |

### 8.2 Authentification

- **Personnel** : téléphone ou email + mot de passe (**argon2id**, ou bcrypt coût ≥ 12 comme l'existant) ;
  **MFA TOTP obligatoire** pour `OWNER` et tous les rôles plateforme, facultative pour les autres.
- **Clients** : téléphone + **code à usage unique** (OTP SMS/WhatsApp) dès qu'un fournisseur est branché ;
  en attendant, téléphone + code secret (modèle Allô-Coursier). Réservation possible sans compte, avec lien
  de gestion signé et à usage limité.
- **Jetons** : accès JWT 15 min (en mémoire côté navigateur) ; **refresh token opaque en cookie
  `httpOnly; Secure; SameSite=Lax`**, stocké haché, **rotation à chaque usage avec détection de
  réutilisation** (réutilisation d'un ancien jeton → révocation de toute la famille de sessions).
  Abandon du `localStorage` utilisé dans les projets actuels.
- Verrouillage progressif après échecs, réinitialisation par lien/OTP à usage unique, notification à
  l'utilisateur de toute nouvelle connexion ou changement de mot de passe.
- Invitations d'employés : lien à usage unique, expiration 72 h, rattaché à un numéro précis.

### 8.3 Autorisation

- Politique **refus par défaut** : une route sans décorateur de permission ou `@Public()` ne démarre pas
  (test automatique qui parcourt toutes les routes).
- Contrôle d'accès objet systématique (salon, `.own`) dans les services, pas seulement dans les
  contrôleurs.
- Accès support : uniquement sur autorisation explicite et temporaire du propriétaire, en lecture seule
  par défaut, bannière visible dans l'interface, chaque action marquée `impersonated_by`.

### 8.4 API et application web

- `helmet` (CSP stricte, HSTS, `frame-ancestors` limité sauf pour le widget de réservation intégrable),
  CORS par liste blanche incluant les domaines personnalisés vérifiés.
- Protection CSRF pour les routes utilisant le cookie (jeton double-soumission + `SameSite`).
- Validation stricte de toutes les entrées (DTO `class-validator`, `whitelist` + `forbidNonWhitelisted`,
  déjà en place) et schémas Zod partagés côté web.
- **Rate-limit Redis** par IP, par utilisateur et par tenant ; limites plus basses sur connexion, OTP et
  réservation publique.
- Pagination obligatoire et taille maximale des réponses ; pas d'énumération (404 identique pour
  « n'existe pas » et « pas à vous »).
- Téléversements : taille maximale, vérification du type réel (octets magiques), ré-encodage des images
  (supprime les métadonnées EXIF/GPS), stockage privé, noms aléatoires.
- **Webhooks entrants** : signature HMAC, fenêtre de temps, idempotence par identifiant de transaction.
  **Webhooks sortants** : signés, avec secret par endpoint.
- Idempotence des opérations d'argent via en-tête `Idempotency-Key`.

### 8.5 Données

- Chiffrement en transit (TLS partout, y compris entre l'API et PostgreSQL si hébergés séparément).
- Chiffrement au repos du disque du serveur ; **chiffrement applicatif** (AES-256-GCM, clé par tenant
  dérivée d'une clé maîtresse hors base) des champs sensibles : allergies/sensibilités, secrets MFA,
  identifiants des connecteurs du tenant (clés CinetPay/LigdiCash d'un salon).
- Minimisation : pas de pièce d'identité client, pas de code PIN Mobile Money, jamais de numéro de carte
  (géré par l'agrégateur).
- Secrets de l'application dans des variables d'environnement validées au démarrage (modèle
  `env.validation.ts` d'Allô-Coursier), jamais dans le dépôt ; rotation documentée.

### 8.6 Traçabilité, sauvegardes, continuité

- `audit_logs` en **ajout seul** (le rôle PostgreSQL de l'API n'a pas le droit `UPDATE`/`DELETE` dessus) :
  connexions, changements de rôles, prix, remises, annulations, remboursements, clôtures de caisse,
  exports, accès support.
- Sauvegardes : `pg_dump` quotidien chiffré + archivage WAL (restauration à un instant donné), copie
  **hors du serveur**, rétention 30 jours ; **test de restauration mensuel** (scripts `infra/backup`
  existants à étendre). Objectifs : perte de données ≤ 15 min, reprise ≤ 4 h.
- Restauration **d'un seul tenant** possible (export logique filtré par `tenant_id`).

### 8.7 Conformité

- **Burkina Faso** : loi n° 001-2021/AN sur la protection des données personnelles, contrôle de la
  **CIL** — déclaration du traitement, information des personnes, droit d'accès/rectification/suppression.
  ⚠️ À faire valider par un juriste avant la commercialisation, ainsi que les obligations pour les autres
  pays visés (UEMOA).
- Répartition des responsabilités : le **salon est responsable de traitement** de ses clients, la
  plateforme est **sous-traitant** → contrat de sous-traitance intégré aux CGU.
- Fonctions de conformité intégrées : registre des consentements, export des données d'un client,
  anonymisation sur demande (en conservant les factures), durées de conservation paramétrées, désinscription
  en un clic dans chaque message marketing.

### 8.8 Sécurité du cycle de développement

- Revue obligatoire des PR, analyse des dépendances (Dependabot / `npm audit`), analyse de secrets,
  SAST en CI.
- Tests : unitaires (moteur de disponibilité, calculs d'argent), intégration avec vraie base PostgreSQL
  (RLS activée), **suite d'isolation tenant**, e2e du parcours réservation → encaissement.
- Environnements séparés (dev, préproduction avec données anonymisées, production).
- Test d'intrusion externe avant l'ouverture commerciale.

---

## 9. Offres SaaS (proposition)

| Offre | Cible | Inclus |
|---|---|---|
| **Solo** | Coiffeur indépendant / petit salon | 1 salon, 3 employés, agenda, file d'attente, réservation en ligne, caisse, CRM, rappels Push |
| **Salon** | Salon établi | 1 salon, 15 employés, + stock, commissions, facturation, fidélité, quota SMS/WhatsApp |
| **Multi-salons** | Chaînes | Salons illimités, + rôles personnalisés, vue consolidée, transferts de stock, marketing avancé |
| **Sur mesure** | Grands comptes | + API, domaine personnalisé, base dédiée possible |

Prix ⚠️ À valider (marché, pouvoir d'achat, coût des SMS).

---

## 10. Feuille de route de réalisation

| Étape | Contenu | Critère de sortie |
|---|---|---|
| 0 | Socle : monorepo, CI, Docker, contexte tenant, RLS, auth + MFA, permissions, audit, tests d'isolation | Deux tenants de test totalement étanches |
| 1 — MVP | Organisation, équipe, catalogue, agenda, file d'attente, réservation en ligne, CRM, caisse espèces + Mobile Money manuel, notifications Push/WhatsApp lien, tableau de bord, inscription libre-service | Un salon pilote fonctionne une semaine sans papier |
| 2 — v1 | Agrégateurs + acomptes, facturation légale, stock, commissions & paie, fidélité, cartes cadeaux, facturation SaaS | 5 à 10 salons payants |
| 3 — v2 | Marketing, avis, dépenses, multi-salons consolidé, SMS/WhatsApp automatiques | Premières chaînes |
| 4 — v3 | API publique, webhooks, assistant IA, app Play Store (TWA) | — |

---

## 11. Décisions à valider

| # | Question | Proposition par défaut |
|---|---|---|
| 1 | Nom commercial et domaine | À définir (vérifier la marque à l'OAPI) |
| 2 | Marché de lancement | Burkina Faso (FCFA, français, Mobile Money), puis UEMOA |
| 3 | Projet dans ce dépôt ou dépôt séparé | Dossier `salons-saas/` dans ce dépôt pour démarrer, dépôt dédié dès la première vente |
| 4 | Durée d'essai gratuit | 30 jours, sans moyen de paiement |
| 5 | Encaissement par les coiffeurs | Désactivé par défaut, activable par salon |
| 6 | Premier fournisseur SMS/WhatsApp | Aucun au lancement (Push + liens `wa.me`), WhatsApp Cloud API en v2 |
| 7 | Prix des offres | À définir avec des salons pilotes |
| 8 | Salon pilote | À identifier (idéalement un salon afro avec tresses + un barbier) |
