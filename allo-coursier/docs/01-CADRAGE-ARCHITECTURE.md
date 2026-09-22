# ALLÔ-COURSIER — Cadrage et architecture (version 2)

> **ALLÔ-COURSIER** — « Livraison • Courses • Services »
> Entreprise mère : **GROUPE AKAMBI SARL** — Lancement : **Ouagadougou et Tenkodogo (Burkina Faso)**
>
> Ce document ne contient **aucun code applicatif**. Il fixe les choix validés et le périmètre avant le
> début du développement.

---

## 0. Décisions validées

| Sujet | Décision |
|---|---|
| Nom | **ALLÔ-COURSIER** (remplace « Akambi Express ») ; GROUPE AKAMBI SARL reste l'entreprise mère. Identifiant technique : `allo-coursier`. |
| Villes | **Ouagadougou** et **Tenkodogo** dès le lancement (tarifs et zones propres à chaque ville). |
| Livreurs | **Salariés et indépendants** : un livreur a un statut `SALARIE` ou `INDEPENDANT`. L'indépendant touche un pourcentage de chaque course (commission déduite) ; pour le salarié, les courses sont comptées (suivi, primes éventuelles) mais il est payé par salaire. |
| Véhicules | **Moto** et **tricycle** (le tricycle pour les gros volumes, avec son propre tarif). |
| Fournisseurs | Aucun contrat Mobile Money, agrégateur ou SMS pour l'instant → la plateforme doit fonctionner **sans eux** au lancement (voir §2.5 et §2.6). |
| Hébergement | **Gratuit ou le moins cher possible** tout en restant professionnel (voir §2.8). |
| Identité | Bleu profond `#0B2A5B`, bleu clair `#2F80ED`, blanc, accent vert `#1DB954`. |
| Format des applications | **Application web installable (PWA)** : on l'installe sur le téléphone en un clic depuis le site, sans passer par le Play Store (voir §2.2). |

> ⚠️ **Vérification conseillée sur le nom** : avant d'investir dans le logo, les enseignes et le nom de
> domaine, vérifier que « Allô-Coursier » n'est pas déjà une marque déposée auprès de l'**OAPI**
> (propriété intellectuelle en Afrique francophone) et que le nom de domaine souhaité est libre.

---

## 1. Analyse du projet

La plateforme relie **clients, livreurs et commerçants**, sous le contrôle d'une administration. Tout
repose sur trois moteurs :

1. **Commandes** : un même circuit d'étapes pour tous les services (colis, courses, achats, repas,
   retrait/dépôt, programmé, entreprises).
2. **Attribution des missions** : proposer la mission au livreur disponible le plus proche, passer au
   suivant en cas de refus, permettre l'affectation manuelle par l'administration.
3. **Argent** : prix calculé par le serveur à partir de règles modifiables, encaissement, commission,
   gains des livreurs, espèces à reverser — tout inscrit dans un registre comptable.

Réalités du terrain prises en compte :

| Réalité | Réponse |
|---|---|
| Réseau instable, data chère | Application très légère, données gardées sur le téléphone, actions du livreur enregistrées hors connexion puis envoyées au retour du réseau, photos compressées. |
| Téléphones Android d'entrée de gamme | Pages simples, peu d'animations, carte chargée seulement quand elle est utile. |
| Adresses peu précises | Adresse = **point sur la carte + repère écrit** (« derrière la pharmacie X, portail bleu ») + téléphone du contact. |
| Paiement en espèces très courant | Espèces gérées dès le départ, avec suivi de ce que chaque livreur doit reverser. |
| Téléphone = identité | Compte créé avec le **numéro de téléphone**. |
| Francs CFA sans centimes | Montants en nombres entiers, arrondis configurables (ex. à 50 FCFA près). |
| Deux villes éloignées (~180 km) | Chaque ville a ses zones, ses tarifs, ses livreurs ; un responsable peut être limité à sa ville. |

---

## 2. Architecture technique

### 2.1 Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript** partout | Un seul langage pour tout le projet. |
| Serveur / API | **NestJS** (Node.js), API **REST** `/api/v1`, documentation Swagger | Même technologie que la plateforme de la laverie : compétences et hébergement mutualisables. |
| Temps réel | **Socket.IO** (WebSocket, avec repli automatique si la connexion est mauvaise) | Suivi GPS, chat, nouvelles missions, commandes entrantes des commerçants. |
| Base de données | **PostgreSQL** via **Prisma** | Fiable pour l'argent. Zones stockées en GeoJSON et distances calculées dans l'application : suffisant pour deux villes, compatible avec tous les hébergeurs bon marché (PostGIS pourra être ajouté si le volume l'exige). |
| Tâches automatiques | **Planificateur intégré à l'API**, qui lit l'état en base toutes les 5 secondes | Expiration des offres, livraisons programmées, relances, paiements non validés : rien n'est perdu en cas de redémarrage, **sans serveur Redis à payer**. |
| Applications (client, livreur, commerçant, admin) | **Next.js + Tailwind CSS**, en **PWA** | Une seule base de code web, installable sur téléphone, utilisable aussi sur ordinateur. |
| Cartes | **Leaflet + tuiles OpenStreetMap** (fournisseur de tuiles interchangeable) | Gratuit, pas de clé Google payante. |
| Distances | Au lancement : distance à vol d'oiseau × coefficient routier configurable (ex. 1,3). Interface `RoutingProvider` pour brancher plus tard un calcul d'itinéraire réel (OSRM gratuit auto-hébergé). | Gratuit et sans dépendance au démarrage. |
| Navigation livreur | Bouton qui ouvre **Google Maps** sur le téléphone du livreur | Gratuit, déjà connu des livreurs. |
| Notifications | **Web Push** (gratuit) + in-app + temps réel ; `SmsProvider` prêt pour plus tard | Déjà maîtrisé dans la plateforme laverie. |
| Fichiers (documents livreurs, photos de preuve) | Disque du serveur au lancement, interface `StorageProvider` prête pour un stockage externe | Aucun coût supplémentaire. |

### 2.2 Application web installable (PWA) — comment ça marche pour l'utilisateur

1. Le client ouvre le lien (ex. `allo-coursier.com`) ou scanne un **QR code** (affiches, flyers, livreurs).
2. Le site propose **« Installer l'application »** → une icône Allô-Coursier apparaît sur l'écran
   d'accueil, l'application s'ouvre en plein écran comme une vraie application.
3. Pas de Play Store, pas de compte Google, ~1–2 Mo au lieu de 20–40 Mo, mises à jour automatiques.

**Deux icônes installables distinctes** depuis le même site :
- **Allô-Coursier** (clients) — `/`
- **Allô-Coursier Livreur** — `/livreur`

L'**espace commerçant** (`/commercant`) et l'**administration** (`/admin`) s'utilisent sur ordinateur,
tablette ou téléphone, et sont aussi installables.

**Limite technique à connaître (livreurs)** : une application web ne peut pas envoyer la position GPS
quand le téléphone est verrouillé ou que l'application est fermée. Solution retenue :
- pendant une mission, l'application garde **l'écran allumé** et envoie la position tant qu'elle est ouverte ;
- **plus tard (phase 2)**, la même application livreur peut être emballée en **fichier APK Android**
  (Capacitor, gratuit) téléchargeable directement depuis le site, pour un suivi GPS même écran éteint —
  sans rien réécrire. Publication sur le Play Store possible ensuite (frais unique de 25 $ chez Google).

### 2.3 Vue d'ensemble

```
   Téléphones / ordinateurs (navigateur ou application installée)
 ┌───────────────┬────────────────┬──────────────────┬─────────────────┐
 │ Client  (/)   │ Livreur        │ Commerçant       │ Administration  │
 │               │ (/livreur)     │ (/commercant)    │ (/admin)        │
 └───────┬───────┴───────┬────────┴────────┬─────────┴────────┬────────┘
         └───────────────┴──── Application Next.js (PWA) ─────┘
                                   │  REST + Socket.IO (HTTPS)
                     ┌─────────────▼─────────────────────────────┐
                     │              API NestJS (/api/v1)          │
                     │ Comptes · Commandes · Attribution · Suivi  │
                     │ Tarifs · Paiements · Portefeuille · Chat   │
                     │ Commerçants · Catalogue · Promotions       │
                     │ Notes · Réclamations · Notifications       │
                     │ Villes/Zones · Rôles · Statistiques · Audit│
                     └──────┬──────────────────────┬──────────────┘
                            │                      │
                 ┌──────────▼──────────┐   ┌───────▼──────────────────────┐
                 │ PostgreSQL           │   │ Fournisseurs (à brancher)     │
                 │ + file de tâches     │   │ PaymentProvider · SmsProvider │
                 └──────────────────────┘   │ RoutingProvider · Stockage    │
                                            └───────────────────────────────┘
```

Tout tient sur **un seul petit serveur** au démarrage ; chaque brique pourra être séparée plus tard si
le volume l'exige.

### 2.4 Circuit d'une commande

```
Parcours commun :
CREATED ─► SEARCHING_DRIVER ─► DRIVER_ASSIGNED ─► DRIVER_AT_PICKUP ─► PICKED_UP
        ─► IN_TRANSIT ─► ARRIVED_AT_DROPOFF ─► DELIVERED ─► COMPLETED

Variantes :
  Courses / achats : DRIVER_AT_PICKUP ─► PURCHASING (montant + photo du ticket) ─► PICKED_UP
  Repas            : MERCHANT_ACCEPTED ─► PREPARING ─► READY (le livreur est appelé pour arriver à temps)
  Programmée       : SCHEDULED ─(tâche automatique à H – X min)─► SEARCHING_DRIVER
  Paiement Mobile Money manuel : PENDING_PAYMENT avant SEARCHING_DRIVER

Sorties : CANCELLED (motif + auteur) · FAILED (destinataire absent…) · RETURNED
```

Chaque changement est vérifié par le serveur (qui a le droit, depuis quelle étape) et historisé avec
l'auteur, l'heure et la position GPS.

### 2.5 Paiements sans contrat opérateur au lancement

Architecture `PaymentProvider` (initier, vérifier le statut, recevoir une confirmation, rembourser).
Moyens disponibles **dès le premier jour, sans aucun contrat** :

| Moyen | Fonctionnement |
|---|---|
| **Espèces** | Payées au ramassage ou à la livraison. Le livreur encaisse ; l'application calcule ce qu'il doit reverser (commission, part commerçant). Au-delà d'un plafond de dette, il ne reçoit plus de missions jusqu'au versement. |
| **Mobile Money « manuel »** | Le client envoie l'argent au **numéro Orange Money / Moov Money de l'entreprise** puis saisit la **référence de la transaction** ; un opérateur de l'administration vérifie et valide en un clic. Aucun code PIN n'est jamais demandé. |
| **Portefeuille Allô-Coursier** | Rechargé par Mobile Money manuel ou en espèces auprès de l'entreprise ; paiement des courses en un clic. |

Plus tard, dès qu'un contrat existe : connecteur **Orange Money**, **Moov Money** ou un **agrégateur**
(la plateforme laverie possède déjà des connecteurs CinetPay et LigdiCash réutilisables) — simple
ajout d'un fournisseur, sans toucher au reste.

### 2.6 Connexion sans fournisseur SMS au lancement

Envoyer des SMS de code (OTP) coûte de l'argent et nécessite un fournisseur. Au lancement :
- inscription avec **numéro de téléphone + code secret à 4–6 chiffres** (stocké chiffré) ;
- blocage temporaire après plusieurs essais ratés, réinitialisation du code par l'administration ;
- dès qu'un fournisseur SMS est choisi : **vérification par SMS (OTP)** activée par un simple réglage
  (interface `SmsProvider` déjà prévue).

### 2.7 Tarifs 100 % modifiables dans l'administration

Règles enregistrées en base, par **ville, zone, type de service, véhicule (moto/tricycle), standard/express**,
avec date d'effet. Le prix est figé dans la commande (un changement de tarif ne modifie jamais une
commande passée). Un **simulateur** permet de tester une règle avant de l'activer.

```
distance_km  = distance calculée (vol d'oiseau × coefficient, puis itinéraire réel plus tard)
prix_course  = max(prix_minimum, prise_en_charge + distance_km × prix_km)
+ express    = supplément fixe et/ou %
+ attente    = minutes au-delà du temps gratuit × prix par minute (calculé à la livraison)
+ suppléments= nuit, tricycle/volume, arrêt supplémentaire, frais d'achat (% du montant avancé)
− promotion
= total client (arrondi au pas choisi)

commission   = taux × frais de livraison (indépendants)
gain livreur = frais de livraison − commission (+ attente, pourboire)
```

### 2.8 Hébergement : gratuit pour tester, quelques euros par mois en production

| Étape | Solution | Coût indicatif |
|---|---|---|
| **Tests / démonstration** | Offres gratuites d'hébergeurs (ex. base de données Neon ou Supabase + serveur Render) | 0 FCFA — mais le serveur gratuit **se met en veille** : premier chargement lent et suivi en temps réel interrompu. **Ne convient pas à l'exploitation réelle.** |
| **Lancement réel (recommandé)** | **Un petit serveur privé (VPS)** chez un hébergeur économique, avec tout dessus via Docker : API, application web, PostgreSQL, sauvegardes automatiques | ~4 à 7 €/mois (≈ 2 600 à 4 600 FCFA) |
| Nom de domaine | ex. `allo-coursier.com` ou `.bf` | ~10 à 15 €/an pour un `.com` |
| Certificat HTTPS | Let's Encrypt | Gratuit |

L'architecture n'est liée à aucun hébergeur : on peut changer de prestataire à tout moment.

### 2.9 Sécurité

- Codes secrets et mots de passe chiffrés (bcrypt), sessions à durée limitée et révocables.
- **Rôles et permissions** fins (ex. « affecter une commande », « modifier les tarifs », « valider un
  paiement »), avec possibilité de limiter un responsable à sa ville.
- Journal d'audit de toutes les actions administratives et financières.
- Numéros masqués entre client et livreur dans le chat ; documents des livreurs en accès restreint.

---

## 3. Arborescence des fichiers

```
allo-coursier/
├── apps/
│   ├── api/                              # Serveur NestJS
│   │   ├── src/
│   │   │   ├── main.ts · app.module.ts
│   │   │   ├── config/                   # Variables d'environnement validées
│   │   │   ├── common/                   # Gardes (connexion, rôles/permissions), pagination, erreurs, idempotence
│   │   │   ├── infra/                    # prisma/, jobs/ (pg-boss), storage/, logger/
│   │   │   └── modules/
│   │   │       ├── auth/                 # Téléphone + code, sessions, (OTP SMS plus tard)
│   │   │       ├── users/                # Clients, adresses
│   │   │       ├── drivers/              # Livreurs, documents, validation, en ligne/hors ligne
│   │   │       ├── merchants/ · catalog/ # Commerçants, horaires, produits/menus
│   │   │       ├── geo/                  # Villes, zones, calcul de distance (RoutingProvider)
│   │   │       ├── pricing/              # Règles, moteur de prix, simulateur
│   │   │       ├── orders/               # Commandes, circuit d'étapes, preuves de livraison
│   │   │       ├── dispatch/             # Recherche du livreur, offres, affectation manuelle
│   │   │       ├── tracking/             # Temps réel (Socket.IO), positions GPS
│   │   │       ├── chat/
│   │   │       ├── payments/providers/   # cash/, manual-mobile-money/, wallet/, (orange-money/, moov-money/ plus tard)
│   │   │       ├── wallet/               # Portefeuilles, registre comptable, caisse livreurs
│   │   │       ├── promotions/ · ratings/ · complaints/
│   │   │       ├── notifications/        # Web Push, in-app, (SMS plus tard)
│   │   │       ├── stats/ · admin/ (rôles & permissions) · settings/ · audit/
│   │   ├── prisma/ (schema.prisma, migrations/, seed.ts)   # seed : Ouagadougou, Tenkodogo, rôles, tarifs de démo
│   │   └── test/
│   │
│   └── web/                              # Next.js PWA — les 4 espaces
│       ├── app/
│       │   ├── (public)/                 # Accueil, services, tarifs, devenir livreur/partenaire, suivi public par lien
│       │   ├── (client)/                 # Connexion, commander, mes commandes, suivi, chat, portefeuille, profil
│       │   ├── livreur/                  # Inscription/documents, missions, mission/[id], revenus, caisse, profil
│       │   ├── commercant/               # Commandes, catalogue, horaires, livraisons, statistiques
│       │   └── admin/                    # Tableau de bord, carte live, commandes, clients, livreurs, commerçants,
│       │                                 # paiements, portefeuilles, tarifs, zones, promotions, réclamations,
│       │                                 # statistiques, notifications, rôles & permissions, paramètres
│       ├── components/ (ui/, map/, order/, chat/)
│       ├── lib/ (api-client, socket, offline-queue, auth)
│       └── public/ (manifest-client.webmanifest, manifest-livreur.webmanifest, sw.js, icônes)
│
├── packages/
│   └── shared/                           # Types, statuts, schémas de validation partagés API ↔ web
│
├── infra/
│   ├── docker-compose.yml                # Développement : postgres+postgis, api, web
│   ├── docker-compose.prod.yml           # Serveur de production + Caddy (HTTPS automatique)
│   └── backup/                           # Sauvegarde quotidienne de la base
├── docs/
├── package.json                          # npm workspaces
└── README.md
```

---

## 4. Base de données (PostgreSQL)

Conventions : identifiants `uuid` ; `created_at`/`updated_at` partout ; montants en entiers (FCFA) ;
coordonnées GPS en latitude/longitude ; zones en polygones GeoJSON.

### 4.1 Comptes et droits
| Table | Contenu |
|---|---|
| `users` | téléphone (unique), nom, prénom, email facultatif, photo, code secret chiffré, statut, dernière connexion |
| `roles` / `permissions` / `role_permissions` / `user_roles` | Rôles (Client, Livreur, Commerçant, Super-admin, Responsable de ville, Dispatcheur, Support, Finance) et permissions ; `user_roles.city_id` pour limiter à une ville |
| `sessions` | appareil, jeton de renouvellement chiffré, expiration, révocation |
| `push_subscriptions` | abonnements Web Push par appareil |
| `otp_codes` | *prévue pour l'OTP SMS futur* |
| `audit_logs` | auteur, action, élément concerné, avant/après, date |

### 4.2 Géographie
| Table | Contenu |
|---|---|
| `cities` | Ouagadougou, Tenkodogo : centre, fuseau, actif |
| `zones` | zone dessinée sur la carte (polygone), ville, active |
| `addresses` | libellé, point GPS, **repère**, détails, contact, téléphone |

### 4.3 Livreurs
| Table | Contenu |
|---|---|
| `driver_profiles` | statut de validation, **type d'emploi (`SALARIE`/`INDEPENDANT`)**, **véhicule (`MOTO`/`TRICYCLE`)**, immatriculation, ville, en ligne, dernière position, note moyenne, plafond de dette espèces, taux de commission propre (facultatif) |
| `driver_documents` | CNIB, permis, carte grise, photo… ; fichier, statut, motif de refus, date d'expiration |
| `driver_location_logs` | trace GPS des missions (purgée après une durée configurable) |
| `driver_shifts` | périodes en ligne/hors ligne (utile pour les salariés) |

### 4.4 Commerçants et catalogue
| Table | Contenu |
|---|---|
| `merchants` | nom, type (restaurant, boutique, supermarché, pharmacie…), logo, position, ville, commission, temps de préparation moyen, statut |
| `merchant_members` | employés du commerçant et leur rôle |
| `merchant_opening_hours` / `merchant_closures` | horaires par jour, fermetures exceptionnelles |
| `catalog_categories` / `products` / `product_options` | menu ou catalogue, prix, disponibilité, options |

### 4.5 Commandes
| Table | Contenu |
|---|---|
| `orders` | référence (`AC-250922-0042`), client, commerçant, ville, **type de service**, **standard/express**, **véhicule demandé**, statut, date programmée, description du colis, budget et montant réel des achats, distance, **détail du prix figé**, frais, remise, attente, total, commission, gain livreur, moyen et statut de paiement, code de livraison chiffré, livreur |
| `order_stops` | points de ramassage et de dépôt (position, repère, contact, heure d'arrivée, attente) |
| `order_items` | articles (repas, liste de courses) |
| `order_status_history` | chaque changement d'étape avec auteur, heure, position |
| `dispatch_offers` | missions proposées aux livreurs : proposé / accepté / refusé / expiré |
| `delivery_proofs` | code de livraison, photo, photo du ticket d'achat |

### 4.6 Tarifs et promotions
| Table | Contenu |
|---|---|
| `pricing_rules` | ville, zone, service, véhicule, prise en charge, prix minimum, prix au km, supplément express (fixe/%), minutes d'attente gratuites, prix de la minute d'attente, supplément nuit, frais d'achat %, arrêt supplémentaire, commission %, pas d'arrondi, dates d'effet, active |
| `promotions` / `promotion_redemptions` | code, type (%, montant, livraison offerte), plafond, limites d'utilisation, dates, utilisations |

### 4.7 Argent
| Table | Contenu |
|---|---|
| `payments` | commande ou rechargement, moyen (`CASH`, `MANUAL_MOBILE_MONEY`, `WALLET`, plus tard `ORANGE_MONEY`…), montant, statut, **référence de transaction** saisie, validé par, date |
| `wallets` | portefeuille client, livreur, commerçant, plateforme |
| `ledger_transactions` / `ledger_entries` | registre comptable : chaque mouvement d'argent en écritures équilibrées, solde après opération |
| `cash_settlements` | versements d'espèces des livreurs à l'entreprise |
| `payout_requests` | demandes de retrait des livreurs indépendants et commerçants |

### 4.8 Communication et qualité
| Table | Contenu |
|---|---|
| `conversations` / `messages` | chat par commande (texte, photo, position, réponses rapides), lu/non lu |
| `notifications` / `notification_templates` | notifications envoyées, modèles de textes modifiables |
| `ratings` | note 1–5 + commentaire (client → livreur, livreur → client, client → commerçant) |
| `complaints` / `complaint_messages` | réclamations : catégorie, statut, responsable, résolution, remboursement |
| `app_settings` | réglages modifiables : délai d'acceptation, rayon de recherche, plafonds, coefficient de distance… |

---

## 5. Périmètre du MVP

### Phase 1 — « Livraison & Courses » à Ouagadougou et Tenkodogo

**Client** : compte par téléphone, profil, adresses favorites ; **colis & documents**, **retrait & dépôt**,
**courses / achats par le livreur** ; standard ou express ; moto ou tricycle ; **livraison programmée** ;
prix calculé automatiquement ; code promo ; paiement espèces, Mobile Money manuel ou portefeuille ;
suivi GPS en direct ; notifications ; chat avec le livreur ; historique ; notation ; réclamation.

**Livreur** : inscription + documents, validation par l'administration ; en ligne/hors ligne ; réception
des missions (sonnerie + compte à rebours), accepter/refuser ; ouverture de Google Maps ; étapes de la
mission ; preuve par **code + photo** ; saisie des achats avec photo du ticket ; revenus, historique,
note, caisse espèces.

**Administration** : tableau de bord ; carte en direct ; commandes (affectation manuelle, annulation) ;
clients ; livreurs (validation, suspension, salariés/indépendants) ; validation des paiements Mobile
Money manuels ; portefeuilles et versements d'espèces ; tarifs + simulateur ; villes et zones ;
promotions ; réclamations ; notifications ; rôles et permissions ; statistiques ; journal d'audit.

**Public** : site de présentation, bouton d'installation, page « Devenir livreur », suivi d'une commande
par lien partagé au destinataire.

### Phase 2 — Restaurants & commerçants
Espace commerçant complet (catalogue/menu, horaires, commandes en direct, suivi, statistiques),
**livraison de repas** dans l'application client, reversements aux commerçants, APK livreur
téléchargeable (GPS écran éteint), SMS/OTP et Mobile Money automatique dès que les contrats existent.

### Phase 3 — Entreprises & croissance
Comptes entreprises avec facturation mensuelle, envoi de livraisons en lot, nouvelles villes, tarifs
aux heures de pointe, livraisons groupées, parrainage/fidélité, Play Store.

### Ordre de développement de la phase 1
1. ✅ Socle : projet, base de données, connexion, rôles, villes/zones, tarifs (+ tests du calcul de prix)
2. ✅ Commandes, attribution des missions, suivi en temps réel, chat
3. ✅ Application livreur
4. ✅ Application client
5. ✅ Administration
6. ✅ Paiements, portefeuille, caisse, notifications, installation sur serveur

À la fin de chaque lot, une version testable est disponible.

---

## 6. Dernier point à confirmer

**Restaurants dans la première version ou non ?** Deux possibilités :
- **A (recommandé)** : on lance d'abord **colis + courses + achats** (plus simple, lancement plus rapide),
  puis on ajoute les **restaurants avec leurs menus** en phase 2.
- **B** : on inclut tout de suite les **restaurants avec menus en ligne** dans la première version
  (lancement plus tardif).

Sans réponse contraire, le développement suivra l'option **A**.
