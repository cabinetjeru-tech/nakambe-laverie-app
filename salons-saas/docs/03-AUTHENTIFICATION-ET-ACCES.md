# Authentification, rôles, permissions et isolation des données

> Code : `apps/api` (NestJS 10, Prisma 6, PostgreSQL 16).
> Tests : `apps/api/test` — 42 tests de bout en bout sur une vraie base PostgreSQL, plus 15 tests unitaires.

---

## 1. Démarrer en local

```bash
cd salons-saas/apps/api
npm install                       # génère aussi le client Prisma
cp .env.example .env              # puis remplir les secrets (commandes openssl indiquées dans le fichier)

# Base : un rôle propriétaire (migrations) + les rôles de connexion (une seule fois)
DATABASE_URL="$DATABASE_MIGRATION_URL" npx prisma migrate deploy
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -v owner_role=salons_owner \
     -v app_password="'...'" -v platform_password="'...'" -f prisma/sql/roles.sql
DATABASE_URL="$DATABASE_MIGRATION_URL" npm run prisma:seed   # offres + catalogue des permissions

npm run start:dev                 # http://localhost:3002/api/v1
```

Tests (base **dédiée**, vidée à chaque exécution) :

```bash
DATABASE_URL=postgresql://salons_app:...@localhost:5432/salons_test \
DATABASE_MIGRATION_URL=postgresql://salons_owner:...@localhost:5432/salons_test \
npm run test:e2e
npm test            # tests unitaires
```

---

## 2. Routes

Toutes les routes sont préfixées par `/api/v1`.

| Méthode | Route | Accès | Rôle |
|---|---|---|---|
| POST | `/auth/signup` | public | Inscription d'un professionnel : entreprise, premier salon, rôles, compte propriétaire |
| POST | `/auth/register` | public | Inscription d'un client final |
| POST | `/auth/login` | public | Connexion par téléphone (format local accepté) ou email |
| POST | `/auth/refresh` | cookie + en-tête `X-Requested-With` | Nouveau jeton d'accès, rotation du refresh token |
| POST | `/auth/logout` | cookie + en-tête | Déconnexion de l'appareil |
| POST | `/auth/logout-all` | connecté | Déconnexion de tous les appareils |
| GET | `/auth/me` | connecté | Profil, entreprises accessibles, droits actifs |
| POST | `/auth/switch-tenant` | connecté | Choisir l'entreprise active |
| POST | `/auth/password/forgot` | public | Envoi d'un code à 6 chiffres |
| POST | `/auth/password/reset` | public | Nouveau mot de passe avec le code |
| POST | `/auth/password/change` | connecté | Changement de mot de passe |
| POST | `/auth/invitations/accept` | public | Rejoindre une équipe (nouveau compte ou compte existant) |
| GET | `/permissions` | `roles.manage` | Catalogue, avec disponibilité dans l'offre |
| GET / POST | `/roles` | `staff.read` / `roles.manage` | Lister / créer (rôles personnalisés : offre Multi-salons) |
| PATCH / DELETE | `/roles/:id` | `roles.manage` | Modifier / supprimer un rôle |
| GET | `/members` | `staff.read` | Membres de l'équipe (limités au périmètre de salons) |
| PUT | `/members/:id/access` | `roles.manage` | Rôles et salons d'un membre |
| POST | `/members/:id/suspend`, `/reactivate` | `staff.manage` | Suspendre / réactiver |
| GET / POST | `/invitations` | `staff.manage` | Invitations en attente / inviter |
| DELETE | `/invitations/:id` | `staff.manage` | Annuler une invitation |
| GET / POST | `/salons` | `salons.read` / `salons.manage` | Salons (limités au périmètre) / ouvrir un salon |
| GET / PATCH | `/salons/:id` | `salons.read` / `salons.manage` | Détail / modification |
| GET | `/health` | public | Supervision |

---

## 3. Sessions

```
Connexion ──▶ jeton d'accès JWT (15 min, en mémoire côté navigateur)
          └─▶ refresh token opaque (30 j) dans un cookie HttpOnly ; SameSite=Strict ; Path=/api/v1/auth
                  │
       /auth/refresh : rotation à chaque usage ; seule l'empreinte HMAC est stockée
                  │
   ancien jeton présenté à nouveau (> 20 s après) ──▶ vol probable : toute la session est révoquée
   ancien jeton présenté dans les 20 s          ──▶ deux onglets simultanés : refus simple, sans révocation
```

- **Jeton d'accès** (HS256, émetteur et audience vérifiés). Il contient :
  - l'utilisateur et la session ;
  - l'entreprise active et l'adhésion ;
  - les permissions effectives ;
  - le périmètre de salons ;
  - la version des permissions.
- **Contrôle à chaque requête** (`LiveAccessService`), dans la transaction de la requête :
  - la session n'est pas révoquée ;
  - le compte est actif ;
  - l'adhésion est active ;
  - la version des permissions n'a pas changé depuis l'émission du jeton.

  Conséquence : une déconnexion, une suspension ou un changement de rôle prend effet **immédiatement**,
  sans attendre l'expiration des 15 minutes.
- **Entreprise en lecture seule** : si l'abonnement est suspendu ou résilié, seules les lectures restent
  possibles.
- **Protection CSRF** des routes à cookie : `SameSite=Strict`, plus un en-tête `X-Requested-With`
  obligatoire (CORS limité aux origines autorisées).

## 4. Mots de passe et récupération

- **Stockage** : argon2id (19 Mio, 2 itérations). Le hachage est mis à jour à la connexion si les
  paramètres changent.
- **Longueur** : 8 à 128 caractères.
- **Verrouillage** :
  - après 5 échecs, le compte est verrouillé 15 min ;
  - la durée double à chaque nouvelle série de 5 échecs, jusqu'à 24 h au maximum ;
  - le compteur est enregistré même si la réponse est une erreur (transaction dédiée).
- **Pas d'indice** : « identifiant inconnu » et « mot de passe faux » donnent le même message, en un temps
  identique (hachage factice).
- **Récupération par code à 6 chiffres** :
  - maximum 3 codes par heure et par numéro ;
  - validité 15 min, 5 essais par code ;
  - seule l'empreinte HMAC du code est stockée ;
  - la réponse est identique que le numéro ait un compte ou non.
- **Après une réinitialisation** : mot de passe changé, verrouillage levé, numéro marqué vérifié,
  **toutes les sessions révoquées**.
- **Changement de mot de passe** : les autres appareils sont déconnectés, l'appareil courant reste connecté.
- **Limitation de débit par IP** : connexion 10/min, inscription 5/h, code oublié 5/15 min, réinitialisation
  10/15 min.

### Envoi des codes : pas encore de fournisseur SMS

Le pilote `OTP_DRIVER=console` écrit le message dans les journaux du serveur. Un administrateur peut le
transmettre à la personne : c'est le mode « réinitialisation par l'administration » prévu au cadrage.

Pour les invitations, l'API renvoie aussi le lien à la personne qui invite, pour qu'elle l'envoie par
WhatsApp. Le secret est placé après `#` dans le lien : il n'apparaît donc pas dans les journaux des
serveurs web.

Brancher un fournisseur SMS ou WhatsApp = ajouter un pilote dans `MessagingService`, sans toucher au reste.

---

## 5. Rôles et permissions

- **Le code ne teste jamais un nom de rôle** : chaque route déclare `@RequirePermissions('code')`,
  `@Authenticated()` ou `@Public()`. Une route **sans** déclaration est refusée : le garde est fermé par
  défaut.
- **Catalogue** : 63 permissions dans `src/core/permissions/catalog.ts`, synchronisées en base par le seed.
- **Rôles créés à l'inscription** : Propriétaire, Gérant, Réceptionniste, Coiffeur et Comptable
  (matrice du cadrage, §5.5). Le rôle Propriétaire a toujours toutes les permissions et n'est pas
  modifiable ; les autres rôles se modifient.
- **Droits effectifs** = permissions des rôles ∩ fonctionnalités de l'offre (± dérogations).
  - Exemple : sur l'offre Solo, les permissions de stock disparaissent du jeton.
  - Les rôles personnalisés sont réservés à l'offre Multi-salons.
- **Règles anti-escalade** (`AccessPolicyService`), toutes testées :
  1. on n'accorde, ne retire ni ne modifie jamais un droit qu'on ne possède pas soi-même ;
  2. seul un propriétaire attribue ou touche au rôle Propriétaire ;
  3. il reste toujours au moins un propriétaire actif ;
  4. on ne modifie pas ses propres accès ;
  5. un membre limité à certains salons n'accorde que ces salons et ne voit que les membres de son
     périmètre.
- **Périmètre salon** : `assertSalonAccess` et `salonIdFilter`. Une ressource hors périmètre répond 404,
  comme une ressource inexistante.
- **Journal d'audit** (ajout seul) : inscription, connexions et échecs, réinitialisations, réutilisation
  de jeton, rôles, accès, suspensions, invitations, salons.

---

## 6. Isolation stricte entre entreprises : trois couches

| Couche | Mécanisme | Ce qu'elle empêche |
|---|---|---|
| 1. API | L'entreprise vient **uniquement** du jeton signé, jamais d'un paramètre ou d'un en-tête. Changer d'entreprise = nouveau jeton, après vérification de l'adhésion | Choisir l'entreprise d'un autre en modifiant la requête |
| 2. Prisma | Extension `tenant-scope` : sur les 90 modèles portant `tenantId`, filtre ajouté à toute lecture, mise à jour ou suppression, et `tenantId` imposé à toute création. Une requête sans entreprise courante, ou visant une autre entreprise, lève `TenantScopeViolation` (journalisée comme incident, réponse 404) | L'oubli d'un `where tenantId` dans un service |
| 3. PostgreSQL | Chaque requête HTTP s'exécute dans **une transaction** qui fixe `app.tenant_id` (valeur locale à la transaction). L'API se connecte avec `salons_app`, **soumis à la RLS** : même une requête SQL brute ne voit ni ne modifie les lignes d'une autre entreprise. Les clés étrangères composites `(tenant_id, id)` empêchent tout lien entre entreprises | Un bug dans les couches 1 et 2, une requête SQL brute, une injection |

`DbService.tx` lève une erreur hors d'une transaction de contexte : aucun accès à la base n'échappe à ce
mécanisme.

Les tests d'isolation (`test/isolation.e2e-spec.ts`) attaquent chacune des trois couches séparément :
- accès par l'API aux salons, rôles, membres et invitations d'une autre entreprise ;
- jeton d'invitation détourné vers une autre entreprise ;
- filtre ou création explicite dans un autre tenant ;
- SQL brut en lecture et en écriture ;
- fuite de contexte entre deux transactions de la même connexion.

---

## 7. Choix et limites connus

| Sujet | État | Suite prévue |
|---|---|---|
| Double authentification (TOTP) | Colonnes prévues (`mfa_secret_enc`), **non implémentée** | Obligatoire pour les propriétaires avant l'ouverture commerciale |
| Envoi SMS/WhatsApp | Pilote console | Brancher un fournisseur (cadrage §11, point 6) |
| Limitation de débit | En mémoire, par instance | Stockage Redis dès qu'il y aura plusieurs instances de l'API |
| Vérification du téléphone à l'inscription | Non vérifié à l'inscription ; vérifié à la première réinitialisation | Code SMS à l'inscription quand un fournisseur existera |
| Rattachement client ↔ fiches des salons | Un client inscrit a un compte mais aucune fiche salon | Rattachement par numéro vérifié lors de la première réservation (module Réservation) |
| Accès du support plateforme | Table prévue (`impersonation_grants`), pas encore d'API | Console éditeur |
| Coût par requête | 1 transaction et 3 requêtes de contrôle par appel authentifié | Mettre en cache en Redis la version des permissions si la charge l'exige |
