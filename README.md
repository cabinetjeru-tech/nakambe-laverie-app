# NOUVELLE LAVERIE AFRICAINE — Plateforme de gestion

Système de gestion central pour **NOUVELLE LAVERIE AFRICAINE** (Tenkodogo, Burkina Faso) :
laverie, pressing, lavage auto/moto, nettoyage textile/chantier, CRM, devis, facturation, paiements,
stock, finances et statistiques.

📄 **Voir `docs/01-ARCHITECTURE.md` pour l'analyse du cahier des charges et les choix d'architecture.**

---

## 1. Structure du dépôt

```
nakambe-app/
├── backend/     API NestJS + Prisma + PostgreSQL
├── frontend/    Site client (PWA) + dashboard admin/employé — Next.js
└── docs/        Documentation (architecture, etc.)
```

## 2. Prérequis

- Node.js 20+ (testé avec Node 22)
- PostgreSQL 14+ (testé avec PostgreSQL 16)
- npm

## 3. Installation — Backend

```bash
cd backend
npm install --legacy-peer-deps   # nécessaire à cause d'un bug connu de npm avec certains peers Prisma/Nest

# 1. Créer la base de données PostgreSQL
sudo -u postgres psql -c "CREATE USER nakambe WITH PASSWORD 'nakambe_dev_pwd' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE nakambe_db OWNER nakambe;"

# 2. Configurer les variables d'environnement
cp .env.example .env   # puis ajuster si besoin (voir §5)

# 3. Appliquer le schéma de base de données
npx prisma migrate dev --name init

# 4. Charger les données de démonstration (§44 du cahier des charges)
npm run prisma:seed

# 5. Lancer l'API en développement
npm run start:dev
```

L'API démarre sur **http://localhost:3001/api**, avec documentation Swagger interactive sur
**http://localhost:3001/api/docs**.

## 4. Installation — Frontend

```bash
cd frontend
npm install

cp .env.local.example .env.local   # puis ajuster NEXT_PUBLIC_API_URL si besoin

npm run dev
```

Le site démarre sur **http://localhost:3000** :
- `/` : vitrine publique + demande de service (PWA installable)
- `/connexion`, `/inscription` : authentification client
- `/suivi` : suivi public d'une commande par numéro (aucune connexion requise)
- `/espace-client` : espace client (commandes, rendez-vous, devis, factures)
- `/admin` : dashboard professionnel (administrateur, gérant, réceptionniste, agents, chauffeur)

## 5. Variables d'environnement

### `backend/.env`

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secrets de signature des jetons — **à changer en production** |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Durées de validité des jetons |
| `PORT` | Port de l'API (3001 par défaut) |
| `FRONTEND_URL` | Origine autorisée pour CORS |
| `COMPANY_*` | Coordonnées affichées sur les documents PDF |
| `SMTP_*` | Optionnel — laisser vide pour désactiver l'envoi d'email |

### `frontend/.env.local`

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL de l'API backend |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Numéro utilisé pour les liens `wa.me` |

## 6. Comptes de démonstration

Créés par `npm run prisma:seed` (données fictives, voir §44 du cahier des charges) :

| Rôle | Téléphone | Mot de passe |
|---|---|---|
| Administrateur | +22670000001 | Nakambe@2026 |
| Gérant | +22670000002 | Nakambe@2026 |
| Réceptionniste | +22670000003 | Nakambe@2026 |
| Agent laverie | +22670000004 | Nakambe@2026 |
| Chauffeur | +22670000005 | Nakambe@2026 |
| Client de démonstration | +22676000001 | Client@2026 |

Le seed crée également : 10 clients, 10 commandes (statuts variés), 5 rendez-vous, 5 paiements,
5 produits de stock, 3 fournisseurs, 3 véhicules, 3 devis, 3 factures, le catalogue complet de
services avec tarifs, une règle de fidélité et un code promo (`BIENVENUE10`).

## 7. Ce qui est implémenté en profondeur vs en base (transparence)

Conformément à la règle de simplicité du cahier des charges (§51), tous les modules listés dans
le cahier des charges ont **leur modèle de données et leur API REST sécurisée** (voir la liste des
tables en §41 de `docs/01-ARCHITECTURE.md`). L'interface web a été construite en profondeur pour le
**parcours principal** :

**Profondeur complète (backend + interface) :**
authentification & rôles, CRM clients, catalogue de services/tarifs, rendez-vous, commandes avec
workflow de statuts complet, devis et factures avec génération PDF réelle, paiements (espèces/Mobile
Money constaté), employés, véhicules, stock et mouvements, fournisseurs, dépenses/recettes,
tableau de bord (CA jour/semaine/mois, alertes stock, services les plus demandés), réclamations,
avis clients, suivi public de commande par numéro, espace client, PWA installable.

**API prête, interface minimale à enrichir :**
contrats B2B, abonnements, règles de fidélité avancées (l'attribution de points est déjà active à
chaque paiement), promotions/codes promo, notifications multi-canal, gestion multi-agence/multi-ville
(le modèle `Branch`/`Zone` existe, une seule agence est active dans les données de démo),
photographie des articles (le champ `photoUrls` existe en base ; l'upload de fichier n'est pas encore
câblé côté interface).

**Volontairement non automatisé (voir §8 de `docs/01-ARCHITECTURE.md`) :**
intégration directe Orange Money/Moov Money (paiement manuel fonctionnel dès aujourd'hui, connecteur
prêt à brancher), envoi WhatsApp automatique (liens `wa.me` fonctionnels, API officielle documentée
comme évolution), SMS (interface prête, aucun fournisseur câblé), mode hors-ligne complet (une v1 de
cache d'application existe via le service worker).

## 8. Application Android

La PWA (`frontend/`) est installable directement depuis un navigateur Android ("Ajouter à l'écran
d'accueil"). Pour publier une application native sur le Google Play Store, deux options sans
réécriture du code :
- **TWA (Trusted Web Activity)** via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) —
  empaquette la PWA existante en `.aab` publiable.
- **Capacitor** (Ionic) — enveloppe la même base Next.js avec accès aux API natives (caméra, GPS)
  si des besoins natifs apparaissent plus tard.

## 9. Sécurité

- Mots de passe hashés (bcrypt, coût 12), jamais stockés en clair.
- Authentification JWT (access court + refresh long, rotation à chaque renouvellement).
- Contrôle de rôle sur chaque route sensible (`RolesGuard`), vérifié aussi côté frontend pour l'UX.
- Prix des prestations toujours résolus côté serveur depuis le catalogue (jamais depuis le client)
  pour empêcher la manipulation des tarifs.
- Journal d'audit (`audit_logs`) sur les actions sensibles : création/modification, changements de
  statut de commande, paiements.
- Aucune donnée de paiement Mobile Money sensible (code PIN, identifiants) n'est jamais demandée ni
  stockée — seule une référence de transaction constatée peut être saisie.

## 10. Prochaines étapes suggérées

1. Brancher un agrégateur de paiement (CinetPay/PayDunya/FedaPay) via l'interface `PaymentProvider`.
2. Ajouter l'upload de photos (articles, chantiers) avec stockage S3-compatible.
3. Construire les interfaces avancées pour contrats B2B, abonnements et promotions.
4. Ajouter la synchronisation hors-ligne complète pour les agents terrain.
5. Empaqueter la PWA en application Android (TWA) pour publication sur le Play Store.
