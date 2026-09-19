# NAKAMBÉ LAVERIE EXPRESS & DIGITALE — Architecture générale (Étape 1)

## 1. Lecture critique du cahier des charges

Le cahier des charges est très complet (53 sections). Avant de coder, voici les
incohérences et points à trancher, avec la décision retenue pour ce projet :

| Point soulevé | Décision retenue et justification |
|---|---|
| "Application Android" + "Dashboard web" + "Interface employé" + "Backend" en une seule livraison | On construit **une seule API centrale** consommée par **plusieurs façades** : un site/PWA client, un dashboard admin web, une interface employé web (mobile-first). L'app Android native (Play Store) est un **wrapper ultérieur** de la PWA (Capacitor/TWA) ou une app React Native — voir §8. Développer 4 clients natifs en parallèle dès le jour 1 diluerait l'effort ; la PWA responsive couvre déjà "Android + ordinateur" dès le départ. |
| Paiement Mobile Money (Orange Money / Moov Money) "intégré" | Une intégration **directe** avec Orange Money Burkina Faso ou Moov Africa exige un compte marchand Pro + convention commerciale + accès à leur API (délai administratif, hors contrôle technique). Pour un MVP réellement exploitable, on prévoit une **interface `PaymentProvider` abstraite** avec un premier fournisseur "Paiement manuel / espèces" fonctionnel immédiatement, et un connecteur prêt à brancher vers un agrégateur (CinetPay, PayDunya, FedaPay — actifs au Burkina Faso, supportent Orange Money et Moov Money via une seule API REST) dès que le compte marchand existe. Aucune app ne doit jamais stocker un code PIN Mobile Money (respecté strictement). |
| WhatsApp "automatisé" | Deux niveaux : (1) **immédiat, gratuit, sans validation** : liens `wa.me` pré-remplis ("Contacter Nakambé", "Envoyer devis") ouverts depuis l'app — c'est ce qui est implémenté. (2) **futur** : API officielle WhatsApp Business Cloud (Meta) pour l'envoi automatique de notifications — nécessite vérification Meta Business, un numéro dédié, et l'approbation de modèles de message ; documenté en §8 mais non câblé par défaut. |
| SMS | Pas de fournisseur SMS local unique universellement disponible et vérifiable techniquement ici : le module Notifications est construit autour d'une interface `NotificationChannel` (in-app, WhatsApp link, email SMTP, SMS) où le SMS est un **connecteur à brancher** (ex. agrégateur local) plutôt qu'un service câblé en dur. |
| "Mode hors connexion" complet | Un mode hors-ligne complet (sync bidirectionnelle avec résolution de conflits) est un chantier à part entière. Le MVP livre une **PWA avec cache applicatif (Service Worker) et lecture des dernières commandes en cache**, plus une file d'écriture locale (IndexedDB) rejouée à la reconnexion pour les actions critiques d'un agent terrain (changement de statut). C'est une v1 du besoin, pas la version finale. |
| Multi-ville / multi-agence dès le départ | Le schéma de données intègre déjà `branches` et `zones` (Tenkodogo comme première agence/zone), pour ne pas avoir à migrer le modèle plus tard — mais l'admin d'aujourd'hui n'aura qu'une seule agence active. |
| 53 sections fonctionnelles | Toutes ne peuvent pas être livrées avec une profondeur égale dans une première itération sans compromettre fiabilité et simplicité (règle §51 du cahier des charges lui-même). La base de données couvre **toutes** les entités listées ; le backend expose une API CRUD sécurisée pour **tous** les modules ; les écrans livrés en profondeur dans cette v1 couvrent le **parcours principal** (client → rendez-vous/devis → commande laverie/pressing → suivi → facture → paiement → statistiques) + gestion employés/stock/clients. Les modules périphériques (contrats B2B, abonnements, fidélité, promotions détaillées) ont leur **table + API** prêtes, avec une UI minimale à enrichir — c'est indiqué clairement dans le README comme "prêt backend, UI à approfondir", jamais présenté comme terminé si ce n'est pas le cas. |

## 2. Principes directeurs (repris de la section 51 du cahier des charges)

1. Simplicité avant exhaustivité visuelle.
2. Rapidité de prise en main pour un personnel peu à l'aise avec le numérique.
3. Fiabilité : le cœur métier (commande, statut, facture, paiement) doit être irréprochable même si des modules annexes sont encore sommaires.
4. Sécurité : mots de passe hashés, rôles, journal d'audit, pas de secret sensible stocké.
5. Évolutivité : schéma multi-agence/multi-ville dès la conception, API versionnée, modules découplés.

## 3. Stack technique retenue

| Couche | Choix | Pourquoi |
|---|---|---|
| Backend API | **NestJS (Node.js/TypeScript)** | Structure modulaire imposée (un module par domaine métier = idéal pour les ~30 modules du cahier des charges), DI native, validation intégrée, Swagger auto-généré, écosystème mature, un seul langage (TS) avec le frontend. |
| ORM / Base de données | **Prisma + PostgreSQL** | PostgreSQL = fiable, gratuit, supporte bien les relations complexes (40+ tables), les enums natifs et les contraintes. Prisma donne des migrations versionnées et un schéma unique lisible comme documentation vivante. |
| Authentification | **JWT (access 15 min + refresh 7 j), mots de passe bcrypt** | Standard, sans dépendance à un service externe payant, fonctionne hors-ligne sur le device après connexion. |
| Frontend Admin + Employé | **Next.js 14 (App Router) + TypeScript + Tailwind CSS** | Un seul framework pour web admin ET PWA client, rendu rapide, bonne DX, responsive par défaut. |
| Frontend Client | **Même app Next.js, en PWA (manifest + service worker)** | Évite de maintenir 2 bases de code avant que le besoin d'une app native distincte soit confirmé ; s'installe sur l'écran d'accueil Android comme une app. |
| Documents (devis/factures/reçus PDF) | **pdf-lib** (génération PDF côté serveur, sans navigateur headless) | Pas de dépendance lourde (pas de Chromium), fonctionne dans un environnement serveur limité en ressources — réaliste pour un hébergement bas coût. |
| Stockage fichiers (photos articles, logo) | Local disque en dev (`/uploads`), interface `StorageProvider` prête pour un bucket S3-compatible (ex. Scaleway, Backblaze — moins chers, dispo hors zone UE/US) en production. |
| Notifications | Interface `NotificationChannel` : in-app (toujours actif), lien WhatsApp `wa.me` (toujours actif), email SMTP (actif si configuré), SMS (connecteur à brancher). |

### Pourquoi pas Firebase / Supabase / low-code ?
Le cahier des charges demande une **base de code réellement possédée et exploitable par l'entreprise**, hébergeable localement ou chez un prestataire de son choix, sans dépendance à un fournisseur cloud étranger facturé en devises et potentiellement restreint au Burkina Faso. Une stack Node/PostgreSQL auto-hébergeable répond mieux à cette exigence de souveraineté et de coût maîtrisé.

## 4. Vue d'ensemble de l'architecture

```
                        ┌──────────────────────────┐
                        │   PostgreSQL (Prisma)     │
                        │  40+ tables (voir §41)    │
                        └────────────▲──────────────┘
                                     │
                        ┌────────────┴──────────────┐
                        │   API NestJS (backend/)    │
                        │  - Auth (JWT + rôles)      │
                        │  - Modules métier (REST)   │
                        │  - Génération PDF          │
                        │  - Journal d'audit         │
                        │  - Swagger /api/docs       │
                        └───────▲───────────▲────────┘
                                │           │
                 HTTPS/JSON     │           │   HTTPS/JSON
                                │           │
         ┌──────────────────────┐   ┌──────────────────────┐
         │  Next.js — Site/PWA   │   │  Next.js — /admin      │
         │  client (public)      │   │  Dashboard + Employé   │
         │  - Accueil vitrine     │   │  - Rôles: admin,       │
         │  - Rendez-vous/devis   │   │    gérant, réceptionn, │
         │  - Suivi commande      │   │    agent, chauffeur    │
         │  - Espace client       │   │                        │
         └──────────────────────┘   └──────────────────────┘
```

Un seul dépôt (monorepo) : `backend/` et `frontend/` (l'app Next.js sert à la fois le site vitrine/client et le dashboard admin/employé via des groupes de routes distincts avec permissions différentes).

## 5. Rôles et permissions (RBAC)

Modélisé en base (`roles`, `permissions`, table de jointure), pas codé en dur, conformément à la section 5 et 49 :
`ADMIN`, `GERANT`, `RECEPTIONNISTE`, `AGENT_LAVERIE`, `AGENT_NETTOYAGE`, `CHAUFFEUR`, `CLIENT`.
Chaque endpoint API vérifie le rôle via un guard NestJS (`@Roles(...)`), et le frontend masque/affiche les menus selon le rôle renvoyé par `/auth/me`.

## 6. Workflow des commandes (cœur du système)

Statuts pilotés par une machine à états stockée en base (table `order_status_history`), reprenant la section 9 :
`DEMANDE_RECUE → RDV_CONFIRME → COLLECTE_PROGRAMMEE → COLLECTE_EFFECTUEE → RECEPTIONNE → TRI → LAVAGE → ESSORAGE → SECHAGE → REPASSAGE → CONTROLE_QUALITE → EMBALLAGE → PRET → LIVRAISON_PROGRAMMEE → LIVRE → TERMINE` (+ `ANNULE`).
Chaque transition enregistre qui (`userId`), quand (`timestamp`), et un commentaire optionnel — répond à l'exigence "qui a modifié quoi, quand".

## 7. Sécurité

- Mots de passe : bcrypt (coût 12).
- JWT signé (secret via variable d'environnement, jamais commité).
- Guards de rôle sur chaque route sensible.
- Validation stricte des entrées (class-validator / DTO) contre l'injection.
- Prisma paramètre toutes les requêtes (protection injection SQL par construction).
- Journal d'audit (`audit_logs`) sur les actions sensibles (création/modification/suppression, changement de statut, paiement).
- Déconnexion automatique côté frontend à l'expiration du refresh token.
- Aucune donnée de paiement Mobile Money (PIN, identifiants) n'est jamais demandée ni stockée.

## 8. Intégrations externes — coût, prérequis, limites (section 51 du cahier des charges)

### a) Paiement Mobile Money
- **Option recommandée pour le Burkina Faso : agrégateur (CinetPay, PayDunya ou FedaPay)**, qui couvre Orange Money BF et Moov Money BF derrière une seule API REST.
  - Prérequis : pièces d'entreprise (RCCM), compte bancaire ou mobile money de réception, validation KYC par l'agrégateur (délai variable, à leur charge).
  - Coût : commission par transaction (généralement de l'ordre de quelques % — **à confirmer contractuellement avec le prestataire choisi**, cela évolue).
  - Disponibilité : oui au Burkina Faso.
  - Limite : dépendance à un tiers, frais par transaction, délai de règlement.
  - Procédure d'intégration : créer un compte marchand → obtenir clé API/clé secrète → implémenter le connecteur `PaymentProvider` déjà prévu dans le code (`backend/src/modules/payments`) → configurer webhook de confirmation de paiement.
- **Option alternative : intégration directe Orange Money Business / Moov Money for Business** — plus de contrôle mais accords commerciaux directs et délais plus longs ; même interface `PaymentProvider` réutilisable.
- **En attendant** : paiement enregistré manuellement par le caissier (espèces ou Mobile Money "constaté", numéro de transaction saisi à la main) — 100% fonctionnel dès aujourd'hui, déjà implémenté.

### b) WhatsApp
- **Immédiat (implémenté)** : liens `https://wa.me/226XXXXXXXX?text=...` — gratuit, aucun compte spécial, fonctionne dans tous les cas.
- **Futur (non câblé)** : WhatsApp Business Cloud API (Meta) pour l'envoi automatique de notifications sortantes. Prérequis : vérification Meta Business Manager, numéro dédié (différent d'un numéro déjà utilisé sur WhatsApp classique), modèles de message pré-approuvés par Meta pour les messages non sollicités. Coût : facturation à la conversation par Meta (des paliers gratuits existent selon la zone). Délai d'activation : plusieurs jours/semaines.

### c) SMS
- Aucun fournisseur n'est câblé par défaut (pas de vérification technique fiable possible ici). Le code expose une interface `NotificationChannel` prête à recevoir un connecteur SMS local (agrégateur burkinabè ou panafricain) le jour où un compte est choisi.

### d) Email
- SMTP standard (ex. compte professionnel ou service transactionnel) — configurable via variables d'environnement, désactivé si non configuré (l'app ne plante pas).

## 9. Feuille de route (étapes du cahier des charges → livrables de ce projet)

1. ✅ Architecture générale (ce document).
2. Arborescence complète du projet.
3. Maquette fonctionnelle des écrans clés (décrite + implémentée en React).
4. Schéma de base de données complet (Prisma).
5. API backend (NestJS).
6. Interface administrateur.
7. Interface employé (intégrée au dashboard, vues filtrées par rôle).
8. Interface client (site/PWA public).
9. Gestion commandes/laverie (workflow statuts).
10. Nettoyage mobile / tricycle.
11. Lavage auto/moto.
12. Devis / factures / paiements (PDF).
13. Stock et finances.
14. Notifications.
15. Tests (scripts de vérification + jeu de données de démo).
16. Corrections.
17. Documentation d'installation et de déploiement.

La suite de ce dépôt (`backend/`, `frontend/`, `docs/`) implémente ces étapes dans l'ordre.
