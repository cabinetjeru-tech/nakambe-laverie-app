# ALLÔ-COURSIER

« Livraison • Courses • Services » — plateforme de GROUPE AKAMBI SARL (Ouagadougou et Tenkodogo, Burkina Faso).

Projet indépendant de la plateforme de la laverie présente à la racine de ce dépôt.

| Document | Contenu |
|---|---|
| [01 — Cadrage et architecture](docs/01-CADRAGE-ARCHITECTURE.md) | Décisions, architecture, base de données, périmètre |
| [02 — Mise en ligne](docs/02-MISE-EN-LIGNE.md) | Installation sur un serveur économique, HTTPS, sauvegardes, mises à jour |
| [03 — Guide de l'équipe](docs/03-GUIDE-EQUIPE.md) | Travail quotidien dans l'administration |

## Ce que contient la plateforme (phases 1 et 2 terminées)

**Application client** (web installable sur le téléphone, `/`) : compte par numéro + code secret ;
colis et documents, retrait et dépôt, petites courses, achats par le livreur ; standard ou express ; moto
ou tricycle ; livraison programmée ; prix affiché avant de commander ; espèces (au départ ou à l'arrivée),
portefeuille ou Mobile Money ; code promo ; suivi GPS en direct ; code de livraison à partager par
WhatsApp ; chat avec le livreur ; notation ; réclamations ; notifications. **Repas & commerces** :
restaurants et boutiques ouverts, menu avec options (viande, accompagnement, suppléments), panier,
suivi de la préparation puis de la livraison.

**Espace commerçant** (web installable, `/commercant`, inscription sur `/partenaires/inscription`) :
commandes en direct avec sonnerie, acceptation avec temps de préparation, refus, « commande prête » ;
menu (catégories, produits, photos, options, plats épuisés) ; horaires, fermetures exceptionnelles,
ouverture/fermeture immédiate ; ventes et plats les plus vendus ; solde et demandes de reversement ;
équipe (propriétaire, gérant, employé).

**Application livreur** (web installable, `/livreur`) : inscription et documents ; en ligne / hors ligne ;
offres avec sonnerie et compte à rebours ; mission guidée étape par étape (itinéraire Google Maps, appel,
achats avec photo du ticket, code du destinataire et photo) ; actions gardées sur le téléphone en cas de
coupure réseau ; gains, espèces à reverser, retraits ; historique.

**Administration** (`/admin`) : tableau de bord ; carte en direct ; commandes (affectation, relance,
annulation, corrections) ; livreurs (salariés/indépendants, validation, documents, versements) ;
commerçants (validation, suspension, commission) ; clients ; paiements Mobile Money à vérifier ; finances ; tarifs et simulateur ; villes et zones
dessinées sur la carte ; promotions ; réclamations ; notifications ; équipe, rôles et droits ;
paramètres ; journal d'audit.

**Serveur** : API REST + temps réel, moteur de tarifs configurable, attribution automatique des
missions, registre comptable en partie double, architecture `PaymentProvider` prête pour Orange Money et
Moov Money.

## Structure

```
allo-coursier/
├── apps/api/        API NestJS + Prisma + PostgreSQL (+ Socket.IO)
│   ├── prisma/      schéma, migrations, seed
│   ├── src/         modules : auth, users, access, drivers, geo, pricing, merchants (commerces, menus,
│   │                horaires), orders (commandes, repas, attribution, livreur, chat, planificateur),
│   │                payments, wallet, promotions, complaints,
│   │                notifications, storage, stats, settings, audit, realtime
│   └── test/        tests de bout en bout
├── apps/web/        Next.js (PWA) : espaces client, livreur, commerçant et administration
├── infra/           docker-compose (dev et production), Caddy (HTTPS), sauvegardes
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

# 2. Dépendances (à la racine du projet allo-coursier/)
npm install

# 3. API : configuration, schéma, données initiales, démarrage
cd apps/api
cp .env.example .env
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev            # http://localhost:3002/api/v1 — documentation : /api/docs

# 4. Application web (autre terminal)
cd apps/web
cp .env.local.example .env.local
npm run dev                  # http://localhost:3000
```

## Comptes créés par le seed

| Compte | Téléphone | Code / mot de passe | Espace |
|---|---|---|---|
| Super-administrateur | 70 00 00 00 | `AlloAdmin@2026` (variables `SEED_ADMIN_*`) | `/admin` |
| Client de démonstration | 76 00 00 01 | `482913` | `/accueil` |
| Livreur de démonstration (Ouagadougou, validé) | 76 00 00 02 | `482913` | `/livreur` |
| Gérante du restaurant de démonstration « Maquis Le Baobab » (menu, options, ouvert 7 h–23 h) | 76 00 00 03 | `482913` | `/commercant` |

Les comptes de démonstration ne sont pas créés quand `NODE_ENV=production`.

> ⚠️ Les **tarifs créés par le seed sont des exemples** : par exemple Ouagadougou en moto, 500 FCFA de
> prise en charge, 1 000 FCFA minimum, 150 FCFA/km au-delà de 2 km, express +500, commission 20 %. Ils
> se modifient dans l'administration, menu **Tarifs**.

## Tests

```bash
cd apps/api
npm test            # 70 tests unitaires : prix, zones, argent, étapes de commande, horaires, panier…
npm run test:e2e    # 54 tests de bout en bout (dont le circuit complet d'un repas) (base dont le nom finit par _test, vidée à chaque lancement)
cd ../web && npm run lint   # vérification des types de l'application web
```

## Sécurité en bref

- Codes secrets et mots de passe chiffrés ; blocage temporaire après 5 essais erronés.
- Sessions courtes renouvelables ; la réutilisation d'un ancien jeton ferme toutes les sessions.
- Permissions vérifiées sur chaque action d'administration ; impossible d'accorder un droit qu'on ne
  possède pas. Un rôle limité à une ville ne donne accès qu'aux commandes, livreurs, carte, statistiques,
  tarifs et zones de cette ville. Les paiements, les finances et les réclamations restent communs à toute
  l'entreprise : réservez ces droits aux rôles sans limite de ville.
- Prix (livraison et paniers de repas) toujours calculés par le serveur ; argent tracé dans un registre à écritures équilibrées.
- Photos vérifiées (vrai format d’image) et servies par des liens signés à durée limitée ; seules les
  photos des menus et logos des commerces sont publiques.
- Le livreur et le commerçant ne voient jamais le code de livraison ; le commerçant ne voit que le
  prénom du client ; le suivi public ne montre aucun numéro de téléphone.
- Journal d'audit des actions sensibles.
