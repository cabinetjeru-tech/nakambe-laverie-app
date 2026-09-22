# AKAMBI EXPRESS — Cadrage et architecture (étape 0, à valider)

> **AKAMBI EXPRESS** — « Livraison • Courses • Services »
> Entreprise mère : **GROUPE AKAMBI SARL** — Pays de lancement : **Burkina Faso**
>
> Ce document ne contient **aucun code applicatif**. Il sert à valider l'analyse, l'architecture,
> l'arborescence, le modèle de données et le périmètre MVP **avant** le début du développement.

---

## 1. Analyse du projet

### 1.1 Ce qu'est réellement la plateforme

Une **place de marché logistique à trois faces** (clients ↔ livreurs ↔ commerçants), pilotée par une
administration. Le cœur de métier n'est pas l'écran de commande, mais trois moteurs :

1. **Le moteur de commande** — une machine à états fiable (créée → livreur trouvé → ramassé → livré),
   commune à tous les types de service (colis, courses, achats, repas, retrait/dépôt, programmé, B2B).
2. **Le moteur de dispatch** — trouver le bon livreur disponible le plus proche, lui proposer la mission,
   gérer le refus/l'expiration, et permettre l'affectation manuelle par l'administration.
3. **Le moteur d'argent** — tarif calculé côté serveur à partir de règles configurables, paiement
   (espèces, portefeuille, Mobile Money), commission plateforme, revenus livreurs, reversements
   commerçants, le tout tracé dans un **grand livre** (ledger) infalsifiable.

Tout le reste (chat, notation, promotions, statistiques…) se greffe sur ces trois moteurs.

### 1.2 Réalités du terrain (Burkina Faso) qui orientent les choix

| Réalité | Conséquence technique |
|---|---|
| Réseau 3G/4G instable, forfaits data chers, coupures | Payloads JSON minimaux, compression, cache local persistant, file d'actions hors-ligne côté livreur, WebSocket avec **repli automatique en polling**, images compressées (WebP) avant envoi, APK léger. |
| Smartphones Android d'entrée de gamme (2–3 Go RAM) | React Native avec moteur Hermes, pas d'animations lourdes, listes virtualisées, carte chargée seulement quand utile. |
| Adressage urbain faible (peu de noms de rue/numéros) | Une adresse = **point GPS épinglé sur la carte + repère textuel** (« derrière la pharmacie X, portail bleu ») + téléphone du contact. On n'essaie pas de géocoder des adresses textuelles. |
| Paiement à la livraison très répandu, Mobile Money (Orange Money, Moov Money) dominant | Espèces supportées dès le MVP avec **rapprochement de caisse livreur** ; Mobile Money via une abstraction `PaymentProvider`. |
| Téléphone = identité principale, email rare | Inscription/connexion **par numéro + OTP SMS** ; email facultatif. Format +226 XXXXXXXX. |
| Monnaie : franc CFA (XOF), sans centimes | Montants stockés en **entiers** (FCFA), arrondis configurables (ex. au multiple de 25 ou 50 FCFA). |
| Flotte majoritairement à moto (+ tricycles pour le volume) | Type de véhicule dans le profil livreur et dans les règles de tarif. |
| Français, public varié en aisance numérique | Interface en français simple, gros boutons, icônes explicites, parcours de commande en 3 écrans max. i18n prévue (mooré/dioula plus tard). |

### 1.3 Points à trancher (et proposition par défaut)

| Point | Proposition |
|---|---|
| Intégration directe Orange Money / Moov Money | Nécessite contrats marchands et documentation officielle fournie par les opérateurs. **On ne code aucune API supposée** : interface `PaymentProvider` + fournisseurs `CASH`, `WALLET` et `MOCK` (tests) fonctionnels dès le MVP ; connecteurs Orange/Moov (ou un agrégateur agréé) ajoutés dès réception des accès. |
| Fournisseur SMS pour l'OTP | Interface `SmsProvider`. En dev : les codes sont affichés dans les logs. En prod : fournisseur à choisir (agrégateur local ou international) — **à décider par GROUPE AKAMBI**. |
| Cartographie | Affichage : Google Maps SDK Android via `react-native-maps` (gratuit pour l'affichage mobile) ; web : Leaflet + tuiles OSM. Calcul d'itinéraires/distances : interface `RoutingProvider` (OSRM auto-hébergé sur l'extrait OSM du Burkina = gratuit ; Google Directions en option). Navigation livreur : ouverture de Google Maps/Waze par lien profond (pas de GPS turn-by-turn maison). |
| Une ou deux applications Android ? | **Deux** : « Akambi Express » (client) et « Akambi Express Livreur ». Permissions (localisation en arrière-plan), publics et cycles de mise à jour différents ; la politique Google Play sur la localisation en arrière-plan est plus simple à justifier sur une app dédiée. Code partagé via des paquets communs. |
| Où vit le code | Ce dépôt héberge la plateforme de la laverie. **Recommandation : un dépôt dédié `akambi-express`**. En attendant, ce dossier `akambi-express/` isole entièrement le projet. |

---

## 2. Architecture technique

### 2.1 Stack retenue

| Couche | Choix | Justification |
|---|---|---|
| Langage | **TypeScript** partout | Un seul langage, types partagés entre API, web et mobile. |
| Monorepo | **pnpm workspaces + Turborepo** | Paquets partagés (types, schémas de validation, client API, design system), builds incrémentaux. |
| Backend / API | **NestJS 10+ (Node.js 20/22 LTS)**, API **REST** versionnée `/api/v1`, OpenAPI/Swagger | Modulaire (un module par domaine), injection de dépendances, déjà maîtrisé dans l'écosystème GROUPE AKAMBI. |
| Temps réel | **Socket.IO** (WebSocket) + adaptateur Redis | Reconnexion automatique, repli long-polling sur réseaux dégradés, salles par commande, scalable horizontalement. |
| Base de données | **PostgreSQL 16 + PostGIS** | Relationnel fiable pour l'argent ; PostGIS pour zones (polygones), rayon de recherche des livreurs, distances. |
| ORM | **Prisma** (+ SQL brut pour les requêtes PostGIS) | Migrations versionnées, schéma lisible. |
| Cache / files | **Redis** + **BullMQ** | Positions live des livreurs, limitation de débit OTP, tâches différées : expiration d'offres, dispatch des livraisons programmées, relances, notifications. |
| Apps Android | **React Native (Expo SDK, workflow « prebuild »)**, EAS Build → AAB/APK | Un seul code pour Android (iOS possible plus tard sans réécriture), mises à jour OTA pour corriger vite. |
| État / données mobile | TanStack Query (cache persistant), Zustand, React Hook Form + Zod | Cache offline-first, peu de boilerplate. |
| Web client + Espace commerçant | **Next.js (App Router)**, Tailwind CSS, PWA | Commande depuis un navigateur, espace commerçant utilisable sur PC ou tablette. |
| Dashboard admin | **Next.js** séparé (`admin.`), Tailwind, TanStack Table, Leaflet | Isolation de sécurité (domaine, cookies, CSP distincts). |
| Notifications push | **Firebase Cloud Messaging** (via expo-notifications) + Web Push | Standard Android, gratuit. |
| SMS | Interface `SmsProvider` | OTP + alertes critiques quand pas de data. |
| Fichiers | Stockage **S3-compatible** (MinIO en auto-hébergé, ou service cloud), URLs signées | Documents livreurs, photos de preuve, logos, catalogues. |
| Observabilité | Logs JSON (pino), Sentry, métriques de santé | Diagnostiquer les incidents terrain. |
| Déploiement | Docker Compose sur VPS (API, Postgres, Redis, MinIO, OSRM) derrière Caddy/Nginx (HTTPS), CI GitHub Actions | Coût maîtrisé ; migration vers Kubernetes inutile avant forte croissance. |

### 2.2 Vue d'ensemble

```
 ┌────────────────┐ ┌────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
 │ App CLIENT     │ │ App LIVREUR    │ │ Web client +        │ │ Dashboard ADMIN     │
 │ React Native   │ │ React Native   │ │ Espace COMMERÇANT   │ │ Next.js             │
 │ (Android)      │ │ (Android)      │ │ Next.js (PWA)       │ │                     │
 └──────┬─────────┘ └──────┬─────────┘ └─────────┬───────────┘ └─────────┬───────────┘
        │ REST + Socket.IO │ REST + Socket.IO    │ REST + Socket.IO      │ REST + Socket.IO
        └──────────────────┴────────────┬────────┴───────────────────────┘
                                        │ HTTPS (Caddy/Nginx, gzip/brotli)
                     ┌──────────────────▼───────────────────────────────┐
                     │              API NestJS  (/api/v1)                │
                     │ Auth·OTP │ Users │ Orders │ Dispatch │ Tracking   │
                     │ Pricing  │ Payments │ Wallet/Ledger │ Chat        │
                     │ Merchants│ Catalog │ Promotions │ Ratings         │
                     │ Complaints │ Notifications │ Geo (villes/zones)   │
                     │ Admin/RBAC │ Stats │ Audit │ Settings             │
                     └───┬──────────┬──────────┬──────────┬─────────────┘
                         │          │          │          │
             ┌───────────▼──┐ ┌─────▼─────┐ ┌──▼──────┐ ┌─▼────────────────────────┐
             │ PostgreSQL   │ │ Redis     │ │ S3/MinIO│ │ Fournisseurs externes     │
             │ + PostGIS    │ │ + BullMQ  │ │ fichiers│ │ (via interfaces)          │
             └──────────────┘ └───────────┘ └─────────┘ │ PaymentProvider (OM, Moov)│
                                                        │ SmsProvider · FCM         │
                                                        │ RoutingProvider (OSRM)    │
                                                        └───────────────────────────┘
```

Un **monolithe modulaire** (une seule API, modules isolés) est volontaire : plus simple à déployer,
à déboguer et moins coûteux qu'une architecture microservices, tout en permettant d'extraire un
module (ex. tracking) plus tard si la charge l'exige.

### 2.3 Les 10 briques demandées

| # | Brique | Conception |
|---|---|---|
| 1 | **App Client** | Onboarding OTP → accueil avec tuiles de services → formulaire en 3 étapes (ramassage, dépôt, détails) → devis instantané (standard/express) → paiement → suivi carte + chat → notation. |
| 2 | **App Livreur** | Inscription + documents → attente validation → bouton **En ligne/Hors ligne** → offres de mission (sonnerie, compte à rebours) → étapes guidées par gros boutons → preuve (OTP/photo) → revenus & caisse. |
| 3 | **Espace Commerçant** | Web (PC/tablette) : commandes entrantes en temps réel avec alerte sonore, accepter/préparer/prêt, catalogue/menu, horaires & fermetures, suivi du livreur, statistiques. |
| 4 | **Dashboard Admin** | Carte live (livreurs + commandes), gestion de toutes les entités, affectation manuelle, validation des livreurs, tarifs, zones, promotions, réclamations, finances, RBAC. |
| 5 | **Backend/API** | NestJS, REST versionné, validation stricte (Zod/class-validator), idempotence sur les écritures critiques (en-tête `Idempotency-Key`), OpenAPI. |
| 6 | **Base de données** | PostgreSQL + PostGIS, voir §4. Montants en entiers, snapshots de prix figés dans la commande, historique complet des statuts. |
| 7 | **Notifications** | Service unique `NotificationService` → canaux `PUSH` (FCM/Web Push), `SMS`, `IN_APP` (+ temps réel), `EMAIL` ; modèles de messages éditables ; préférences utilisateur ; envoi asynchrone via BullMQ avec reprises. |
| 8 | **Géolocalisation** | Livreur : envoi de position adaptatif (≈ 5 s en course, 30–60 s en attente, rien hors ligne), en lots si réseau coupé. Serveur : dernière position dans Redis (GEO), diffusion dans la salle Socket.IO de la commande, trace échantillonnée en base. Zones = polygones PostGIS. |
| 9 | **Paiements** | Voir §2.5. |
| 10 | **Chat** | Conversation par commande (client ↔ livreur, + commerçant/support), messages persistés, identifiant client de message pour éviter les doublons après reconnexion, réponses rapides pré-écrites, photo et position partageables, push si destinataire hors ligne. Numéros masqués entre client et livreur. |

### 2.4 Moteur de commande (machine à états)

```
Parcours commun :
CREATED ─► (PENDING_PAYMENT) ─► SEARCHING_DRIVER ─► DRIVER_ASSIGNED ─► DRIVER_AT_PICKUP
        ─► PICKED_UP ─► IN_TRANSIT ─► ARRIVED_AT_DROPOFF ─► DELIVERED ─► COMPLETED (après notation/délai)

Variantes activées par service_type :
  Courses / achats : DRIVER_AT_PICKUP ─► PURCHASING (montant + photo du ticket) ─► PICKED_UP
  Repas            : MERCHANT_ACCEPTED ─► PREPARING ─► READY  (en parallèle du dispatch,
                     le livreur est déclenché pour arriver quand la commande est prête)
  Programmée       : SCHEDULED ─(tâche BullMQ à H – X min)─► SEARCHING_DRIVER

États de sortie : CANCELLED (motif + auteur, frais éventuels) · FAILED (destinataire absent…) · RETURNED
```

- Chaque transition est validée côté serveur (qui a le droit, depuis quel état) et journalisée
  dans `order_status_history` (auteur, horodatage, position GPS).
- Un seul modèle `Order` pour tous les services ; le `service_type` active les étapes spécifiques.

### 2.5 Paiements — architecture `PaymentProvider`

```ts
interface PaymentProvider {
  readonly code: PaymentProviderCode;           // CASH, WALLET, ORANGE_MONEY, MOOV_MONEY, MOCK...
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;  // → PENDING / SUCCEEDED / action requise
  getStatus(providerReference: string): Promise<PaymentStatus>;
  handleWebhook?(headers: Record<string, string>, rawBody: Buffer): Promise<WebhookResult>; // signature vérifiée
  refund?(paymentId: string, amount: number): Promise<RefundResult>;
}
```

- `PaymentsService` choisit le fournisseur via un registre ; activation/désactivation et paramètres
  par fournisseur **dans l'admin** (secrets en variables d'environnement, jamais en base en clair).
- Cycle : `INITIATED → PENDING → SUCCEEDED | FAILED | CANCELLED | EXPIRED`, puis `REFUNDED`.
  Confirmation par webhook **et** par interrogation périodique (le webhook peut ne jamais arriver).
- Chaque mouvement d'argent produit des **écritures équilibrées dans le grand livre** (`ledger_entries`) :
  portefeuille client, livreur, commerçant, compte plateforme (commissions), compte « espèces à reverser ».
- **Espèces** : le livreur encaisse → sa dette envers la plateforme (commission + part commerçant)
  augmente → rapprochement lors du versement ; seuil de dette au-delà duquel il ne reçoit plus d'offres.
- Aucun code PIN Mobile Money n'est jamais saisi ni stocké dans nos applications.

### 2.6 Moteur de tarification (100 % configurable)

Les règles sont en base, éditées dans l'admin, **versionnées** (dates d'effet) et **figées** dans la
commande au moment du devis (`price_breakdown` JSON) : un changement de tarif n'altère jamais une
commande passée.

Sélection de la règle : la plus spécifique qui correspond à (ville, zone, type de service, type de
véhicule, vitesse), active à la date.

```
distance_km    = RoutingProvider (itinéraire routier), repli : distance à vol d'oiseau × coefficient
prix_course    = max(prix_minimum, prise_en_charge + distance_km × prix_km [+ durée × prix_min])
+ express      = supplément fixe et/ou % (si EXPRESS)
+ attente      = max(0, minutes_attente − minutes_gratuites) × prix_minute_attente  (calculé à la livraison)
+ suppléments  = nuit, poids/taille, arrêt supplémentaire, frais d'achat (% du montant avancé pour les courses)
− promotion    = code promo / campagne (plafonnée)
= total client (arrondi au pas configuré, ex. 50 FCFA)

commission_plateforme = taux_commission × frais de livraison (règle ou commerçant)
gain_livreur          = frais de livraison − commission_plateforme (+ attente + pourboire)
```

Un **simulateur de devis** dans l'admin permet de tester une règle avant activation.

### 2.7 Dispatch (attribution des missions)

1. Candidats = livreurs `APPROVED`, en ligne, sans mission incompatible, véhicule adapté, dans un rayon
   (PostGIS / Redis GEO), dette espèces sous le seuil.
2. Score = distance (principal) + note + équité (temps depuis dernière mission).
3. Offre envoyée au meilleur candidat (push haute priorité + Socket.IO) avec délai d'acceptation
   configurable (ex. 30 s). Refus/expiration → candidat suivant ; rayon élargi par paliers.
4. Échec après N tentatives → alerte admin, **affectation manuelle** possible à tout moment.
5. Paramètres (rayon, délai, paliers) configurables dans l'admin.

### 2.8 Optimisations « connexion faible »

- Réponses compressées (brotli/gzip), champs strictement nécessaires, pagination par curseur, ETag.
- Cache persistant (TanStack Query + MMKV) : l'app affiche immédiatement les dernières données.
- **File d'actions hors ligne** côté livreur (changements de statut, preuves) rejouée à la
  reconnexion avec clé d'idempotence et horodatage d'origine.
- Socket.IO avec reconnexion exponentielle ; si le temps réel tombe, repli en polling espacé.
- Photos redimensionnées/compressées sur le téléphone avant envoi (< 200 Ko), envoi repris si coupé.
- SMS de secours pour les événements critiques (code de livraison, livreur arrivé) si pas de data.
- APK visé < 30 Mo ; polices système ; pas de bibliothèques lourdes non indispensables.

### 2.9 Sécurité

- JWT d'accès court (15 min) + refresh token rotatif lié à l'appareil, révocable.
- OTP : 6 chiffres, haché, 5 min de validité, limites par numéro/IP/appareil, blocage progressif.
- **RBAC** : rôles + permissions fines (ex. `orders.assign`, `pricing.update`, `payments.refund`)
  vérifiées par garde NestJS ; périmètre par ville possible pour les gestionnaires.
- Journal d'audit de toutes les actions administratives et financières.
- Webhooks paiement : vérification de signature, idempotence, rejeu sûr.
- Données personnelles : numéros masqués client/livreur, documents livreurs en stockage privé
  (URLs signées temporaires), conformité à la loi burkinabè sur la protection des données (CIL).

---

## 3. Arborescence des fichiers proposée

```
akambi-express/
├── apps/
│   ├── api/                              # Backend NestJS
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/                   # Chargement/validation des variables d'environnement
│   │   │   ├── common/                   # Guards (JWT, RBAC), intercepteurs, filtres, pagination, idempotence
│   │   │   ├── infra/                    # prisma/, redis/, queue/ (BullMQ), storage/ (S3), logger/
│   │   │   └── modules/
│   │   │       ├── auth/                 # OTP, JWT, refresh, appareils
│   │   │       ├── users/                # Profils clients, adresses
│   │   │       ├── drivers/              # Profils, documents, validation, disponibilité
│   │   │       ├── merchants/            # Commerçants, personnel, horaires
│   │   │       ├── catalog/              # Catégories, produits, options
│   │   │       ├── geo/                  # Pays, villes, zones (PostGIS), RoutingProvider
│   │   │       ├── pricing/              # Règles, moteur de calcul, simulateur
│   │   │       ├── orders/               # Commandes, machine à états, preuves
│   │   │       ├── dispatch/             # Recherche, offres, affectation manuelle
│   │   │       ├── tracking/             # Gateway Socket.IO, positions
│   │   │       ├── chat/                 # Conversations, messages
│   │   │       ├── payments/
│   │   │       │   ├── providers/        # payment-provider.interface.ts, cash/, wallet/, mock/,
│   │   │       │   │                     # orange-money/, moov-money/ (squelettes à compléter)
│   │   │       │   └── webhooks/
│   │   │       ├── wallet/               # Portefeuilles, grand livre, retraits/versements
│   │   │       ├── promotions/
│   │   │       ├── ratings/
│   │   │       ├── complaints/
│   │   │       ├── notifications/        # Service, canaux (push, sms, in-app, email), modèles
│   │   │       ├── stats/                # Indicateurs, exports
│   │   │       ├── admin/                # RBAC : rôles, permissions, comptes staff
│   │   │       ├── settings/             # Paramètres dynamiques (dispatch, OTP, seuils)
│   │   │       └── audit/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts                   # Villes, zones, rôles, tarifs de démo
│   │   └── test/                         # Tests e2e (commande complète, paiement, dispatch)
│   │
│   ├── client-mobile/                    # App Android client (Expo / React Native)
│   │   ├── app/                          # Expo Router : (auth)/, (tabs)/accueil, commandes, portefeuille, profil
│   │   │   └── commande/                 # nouvelle/, [id]/suivi, [id]/chat, [id]/noter
│   │   ├── src/ (components/, features/, hooks/, services/, store/)
│   │   └── app.config.ts
│   │
│   ├── driver-mobile/                    # App Android livreur (Expo / React Native)
│   │   ├── app/                          # (auth)/, inscription/documents, (tabs)/missions, revenus, profil
│   │   │   └── mission/[id]/             # étapes, preuve, chat
│   │   ├── src/ (features/, services/location/, services/offline-queue/ ...)
│   │   └── app.config.ts
│   │
│   ├── web/                              # Next.js : site public + commande web + espace commerçant
│   │   └── app/
│   │       ├── (public)/                 # accueil, services, tarifs, devenir livreur/partenaire, suivi public
│   │       ├── (client)/                 # commander, mes commandes, suivi
│   │       └── commercant/               # tableau de bord, commandes, catalogue, horaires, stats
│   │
│   └── admin/                            # Next.js : dashboard d'administration
│       └── app/
│           ├── tableau-de-bord/  carte-live/  commandes/  livraisons/
│           ├── clients/  livreurs/  commercants/
│           ├── paiements/  portefeuilles/  tarifs/  zones/  promotions/
│           ├── reclamations/  statistiques/  notifications/
│           └── parametres/ (roles-permissions/, equipe/, systeme/)
│
├── packages/
│   ├── shared/                           # Enums, types, schémas Zod, constantes (statuts, services)
│   ├── api-client/                       # Client HTTP typé (généré depuis OpenAPI) + client Socket.IO
│   ├── ui-mobile/                        # Design system React Native (couleurs, boutons, cartes)
│   ├── ui-web/                           # Design system web (Tailwind preset, composants)
│   └── config/                           # tsconfig, eslint, prettier partagés
│
├── infra/
│   ├── docker-compose.yml                # postgres+postgis, redis, minio, osrm, api
│   ├── docker-compose.prod.yml
│   ├── caddy/ (Caddyfile)
│   └── osrm/                             # Script de préparation de l'extrait OSM Burkina Faso
├── docs/                                 # Ce document, décisions d'architecture, guides d'exploitation
├── .github/workflows/                    # CI : lint, typecheck, tests, build
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Base de données (PostgreSQL + PostGIS)

Conventions : clés primaires `uuid` ; `created_at`/`updated_at` partout ; montants en `integer` (FCFA) ;
suppression logique (`deleted_at`) pour les entités métier ; coordonnées en `geography(Point,4326)`.

### 4.1 Identité, accès, RBAC

| Table | Champs principaux |
|---|---|
| `users` | id, phone (unique, E.164), first_name, last_name, email?, avatar_url, status (`ACTIVE`/`SUSPENDED`/`DELETED`), locale, last_login_at |
| `roles` | id, code (`CLIENT`, `DRIVER`, `MERCHANT_OWNER`, `MERCHANT_STAFF`, `SUPER_ADMIN`, `OPS_MANAGER`, `DISPATCHER`, `SUPPORT`, `FINANCE`…), name, is_system |
| `permissions` | id, code (`orders.read`, `orders.assign`, `pricing.update`, `payments.refund`…), description |
| `role_permissions` | role_id, permission_id |
| `user_roles` | user_id, role_id, city_id? (périmètre) |
| `otp_codes` | id, phone, code_hash, purpose, attempts, expires_at, consumed_at, ip, device_id |
| `refresh_tokens` | id, user_id, device_id, token_hash, expires_at, revoked_at |
| `devices` | id, user_id, platform, push_token, app_name, app_version, last_seen_at |
| `audit_logs` | id, actor_id, action, entity_type, entity_id, before (jsonb), after (jsonb), ip, created_at |

### 4.2 Géographie

| Table | Champs principaux |
|---|---|
| `countries` | id, code (`BF`), name, currency (`XOF`), phone_prefix (`+226`) |
| `cities` | id, country_id, name, center (point), is_active, timezone |
| `zones` | id, city_id, name, area (`geography(Polygon)`), is_active, priority |
| `addresses` | id, user_id, label (« Maison », « Bureau »), location (point), landmark, details, contact_name, contact_phone, city_id |

### 4.3 Livreurs

| Table | Champs principaux |
|---|---|
| `driver_profiles` | user_id (PK), status (`PENDING`/`APPROVED`/`REJECTED`/`SUSPENDED`), vehicle_type (`MOTO`/`TRICYCLE`/`VOITURE`/`VELO`), plate_number, city_id, is_online, current_location, last_location_at, rating_avg, rating_count, cash_debt_limit, approved_by, approved_at |
| `driver_documents` | id, driver_id, type (`CNIB`, `PERMIS`, `CARTE_GRISE`, `ASSURANCE`, `PHOTO`, `CASIER`), file_key, status, rejection_reason, expires_at, reviewed_by |
| `driver_location_logs` | id, driver_id, order_id?, location, speed, heading, accuracy, recorded_at — *partitionnée par mois, purge configurable* |
| `driver_availability_logs` | id, driver_id, went_online_at, went_offline_at |

### 4.4 Commerçants & catalogue

| Table | Champs principaux |
|---|---|
| `merchants` | id, name, slug, type (`RESTAURANT`/`BOUTIQUE`/`SUPERMARCHE`/`PHARMACIE`/`ENTREPRISE`), logo_url, cover_url, phone, location, address_text, city_id, zone_id, commission_rate, avg_prep_minutes, status, is_open_override |
| `merchant_members` | merchant_id, user_id, role (`OWNER`/`MANAGER`/`STAFF`) |
| `merchant_opening_hours` | merchant_id, weekday, opens_at, closes_at |
| `merchant_closures` | merchant_id, starts_at, ends_at, reason |
| `catalog_categories` | id, merchant_id, name, position |
| `products` | id, merchant_id, category_id, name, description, price, image_url, is_available, position |
| `product_option_groups` / `product_options` | groupes (min/max choix) et options (libellé, prix additionnel) |
| `business_accounts` *(phase 3)* | id, company_name, ifu, rccm, billing_contact, credit_limit, billing_cycle |

### 4.5 Commandes & livraisons

| Table | Champs principaux |
|---|---|
| `orders` | id, reference (`AKX-250922-0042`), client_id, merchant_id?, business_account_id?, city_id, service_type (`PARCEL`, `ERRAND`, `PURCHASE`, `FOOD`, `PICKUP_DROP`, `B2B`), speed (`STANDARD`/`EXPRESS`), status, scheduled_at?, package_description, package_size, is_fragile, purchase_budget?, purchase_actual_amount?, distance_m, duration_s, pricing_rule_id, price_breakdown (jsonb figé), items_subtotal, delivery_fee, discount, waiting_fee, total, commission_amount, driver_earning, payment_method, payment_status, promotion_id?, delivery_code_hash, driver_id?, cancelled_by, cancel_reason, timestamps clés (accepted_at, picked_up_at, delivered_at) |
| `order_stops` | id, order_id, sequence, kind (`PICKUP`/`DROPOFF`), location, landmark, contact_name, contact_phone, arrived_at, completed_at, waiting_seconds |
| `order_items` | id, order_id, product_id?, label, quantity, unit_price, options (jsonb), note — *repas et listes de courses* |
| `order_status_history` | id, order_id, from_status, to_status, actor_id, actor_role, location?, note, created_at |
| `dispatch_offers` | id, order_id, driver_id, attempt, status (`OFFERED`/`ACCEPTED`/`REJECTED`/`EXPIRED`/`CANCELLED`), distance_m, offered_at, expires_at, responded_at, reject_reason |
| `delivery_proofs` | id, order_id, stop_id, type (`OTP`/`PHOTO`/`SIGNATURE`/`RECEIPT`), file_key?, verified, location, created_at |

### 4.6 Tarification & promotions

| Table | Champs principaux |
|---|---|
| `pricing_rules` | id, name, city_id, zone_id?, service_type?, vehicle_type?, base_fare, min_fare, price_per_km, price_per_minute, included_km, express_fixed, express_percent, waiting_free_minutes, waiting_price_per_minute, night_surcharge, night_start/end, purchase_fee_percent, extra_stop_fee, commission_percent, rounding_step, priority, valid_from, valid_to, is_active, version, created_by |
| `pricing_surcharges` | id, city_id, type (`PEAK`/`WEATHER`/`EVENT`/`SIZE`), condition (jsonb), amount_fixed, amount_percent, active_from/to |
| `promotions` | id, code?, name, type (`PERCENT`/`FIXED`/`FREE_DELIVERY`), value, max_discount, min_order_amount, applies_to (service/ville/commerçant), usage_limit, per_user_limit, first_order_only, starts_at, ends_at, is_active, funded_by (`PLATFORM`/`MERCHANT`) |
| `promotion_redemptions` | id, promotion_id, user_id, order_id, discount_amount |

### 4.7 Argent : paiements, portefeuilles, grand livre

| Table | Champs principaux |
|---|---|
| `payments` | id, order_id?, user_id, purpose (`ORDER`/`WALLET_TOPUP`), provider (`CASH`/`WALLET`/`ORANGE_MONEY`/`MOOV_MONEY`/…), amount, currency, status, provider_reference, idempotency_key (unique), payer_phone, failure_reason, metadata (jsonb), confirmed_at |
| `payment_events` | id, payment_id?, provider, event_type, payload (jsonb), signature_valid, processed_at — *journal brut des webhooks* |
| `wallets` | id, owner_type (`USER`/`MERCHANT`/`PLATFORM`), owner_id, kind (`CLIENT`/`DRIVER`/`MERCHANT`/`PLATFORM_REVENUE`/`CASH_CLEARING`), balance (cache), currency, status |
| `ledger_transactions` | id, type (`ORDER_PAYMENT`, `COMMISSION`, `DRIVER_EARNING`, `TOPUP`, `WITHDRAWAL`, `REFUND`, `CASH_SETTLEMENT`, `ADJUSTMENT`), order_id?, payment_id?, description, created_by |
| `ledger_entries` | id, transaction_id, wallet_id, amount (signé), balance_after — *somme des entrées d'une transaction = 0* |
| `payout_requests` | id, wallet_id, amount, method, destination_phone, status, processed_by, processed_at |
| `cash_settlements` | id, driver_id, amount, received_by, method, note, created_at — *versements d'espèces des livreurs* |

### 4.8 Communication & qualité

| Table | Champs principaux |
|---|---|
| `conversations` | id, order_id, type (`ORDER`/`SUPPORT`), closed_at |
| `conversation_participants` | conversation_id, user_id, role, last_read_at |
| `messages` | id, conversation_id, sender_id, client_message_id (unique), type (`TEXT`/`IMAGE`/`LOCATION`/`QUICK_REPLY`/`SYSTEM`), body, attachment_key, created_at |
| `notifications` | id, user_id, type, title, body, data (jsonb), channels, read_at, created_at |
| `notification_templates` | id, code, channel, locale, title, body (variables `{{reference}}`…) |
| `notification_deliveries` | id, notification_id, channel, status, provider_message_id, error, attempts |
| `broadcast_campaigns` | id, audience (filtres), title, body, scheduled_at, sent_count, created_by |
| `ratings` | id, order_id, rater_id, target_type (`DRIVER`/`CLIENT`/`MERCHANT`), target_id, score (1–5), tags, comment |
| `complaints` | id, reference, order_id?, user_id, category (`RETARD`, `COLIS_ENDOMMAGE`, `PAIEMENT`, `COMPORTEMENT`, `AUTRE`), description, status (`OPEN`/`IN_PROGRESS`/`RESOLVED`/`REJECTED`), priority, assigned_to, resolution, refund_amount, resolved_at |
| `complaint_messages` | id, complaint_id, author_id, body, attachment_key, is_internal |
| `app_settings` | key, value (jsonb), description, updated_by — *délais de dispatch, rayon, seuils, versions minimales d'app* |

**Index clés** : GiST sur `current_location`, `zones.area`, `addresses.location` ; `orders(status, city_id)`,
`orders(client_id, created_at desc)`, `orders(driver_id, created_at desc)`, `dispatch_offers(driver_id, status)`,
`messages(conversation_id, created_at)`, `ledger_entries(wallet_id, created_at)`.

---

## 5. Périmètre du MVP (proposition)

Principe : lancer **une ville (Ouagadougou)** avec un parcours complet, fiable et monétisé, plutôt que
tout couvrir superficiellement. La base de données et l'architecture couvrent dès le départ les phases
suivantes, pour ne rien avoir à refondre.

### Phase 1 — MVP « Livraison & Courses » (exploitable commercialement)

**Backend** : auth OTP, utilisateurs/adresses, villes/zones, moteur de tarification + simulateur,
commandes (machine à états), dispatch automatique + manuel, tracking temps réel, chat, notifications
(push + SMS via interface + in-app), paiements (`CASH`, `WALLET`, `MOCK`, interface prête pour
Orange/Moov), portefeuilles + grand livre, caisse livreur, notation, réclamations, RBAC, audit.

**App client Android** :
- Inscription/connexion OTP, profil, adresses favorites (épingle + repère)
- Services : **colis & documents**, **retrait & dépôt**, **petites courses / achats par le livreur**
  (liste libre + budget, photo du ticket, remboursement du montant avancé)
- Livraison **standard / express**, **livraison programmée** (date/heure)
- Devis automatique détaillé, code promo
- Paiement espèces (au ramassage ou à la livraison) ou portefeuille
- Suivi GPS temps réel, notifications, chat avec le livreur, appel masqué
- Historique, notation, réclamation

**App livreur Android** :
- Inscription + téléversement des documents, écran « en attente de validation »
- En ligne / hors ligne, réception d'offres avec compte à rebours, accepter/refuser
- Navigation (ouverture Google Maps/Waze), étapes de mission, file hors ligne
- Preuve de livraison **OTP + photo**, saisie du montant des achats + photo du ticket
- Revenus (jour/semaine), historique, note, solde de caisse espèces

**Dashboard admin** :
- Tableau de bord (commandes du jour, CA, commissions, livreurs en ligne, délais moyens)
- Carte live, liste et détail des commandes, **affectation/réaffectation manuelle**, annulation
- Clients, livreurs (validation des documents, suspension), paiements, portefeuilles,
  encaissements espèces des livreurs
- Tarifs (règles + simulateur), villes & zones (dessin sur carte), promotions (codes)
- Réclamations, notifications (envoi ciblé), rôles & permissions, paramètres, audit

**Web** : site vitrine + suivi public d'une commande par lien (partageable au destinataire).

### Phase 2 — Commerçants & Restaurants

Espace commerçant web (profil, catalogue/menu, horaires, commandes en temps réel, suivi des livraisons,
statistiques), **livraison de repas** dans l'app client (liste des restaurants, panier, options),
reversements commerçants, **Mobile Money** (dès obtention des accès Orange Money / Moov Money),
rechargement du portefeuille, commande depuis le web.

### Phase 3 — Entreprises & croissance

Comptes entreprises (B2B) avec facturation mensuelle, import de livraisons en lot, API/Webhooks pour
e-commerçants, multi-ville (Bobo-Dioulasso, Koudougou…), tarification dynamique (heures de pointe),
regroupement de livraisons multi-arrêts, parrainage/fidélité, statistiques avancées et exports,
langues locales, application iOS.

### Estimation indicative de la phase 1

Découpée en lots livrables et testables, dans cet ordre :
1. Socle monorepo + infra Docker + base de données + auth OTP + RBAC
2. Géo, tarification, commandes (API) + tests du moteur de prix et de la machine à états
3. Dispatch + tracking temps réel + chat
4. App livreur
5. App client
6. Dashboard admin
7. Paiements/portefeuille/caisse, notifications, durcissement, déploiement, publication Play Store (tests internes)

---

## 6. Décisions attendues avant de coder

1. **Dépôt** : créer un dépôt dédié `akambi-express` (recommandé) ou continuer dans ce dossier ?
2. **Périmètre MVP** : valider le découpage en phases (repas/commerçants en phase 2) ou avancer les restaurants en phase 1 ?
3. **Ville de lancement** : Ouagadougou ? (le schéma est multi-ville de toute façon)
4. **Modèle livreurs** : indépendants rémunérés à la commission, salariés, ou les deux ?
5. **Véhicules** au lancement : moto seulement, ou moto + tricycle/voiture ?
6. **Fournisseurs** : avez-vous déjà (ou en cours) un contrat marchand Orange Money / Moov Money, un agrégateur de paiement, un fournisseur SMS ?
7. **Hébergement** : VPS chez un prestataire de votre choix (recommandé pour démarrer) ou autre contrainte ?
8. **Identité** : logo existant ? Sinon je propose une charte (bleu profond `#0B2A5B`, bleu clair `#2F80ED`, blanc, accent vert `#1DB954`) déclinée dans les deux apps et le web.
