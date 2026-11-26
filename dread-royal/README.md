# DREAD ROYAL MANAGEMENT SYSTEM

> **African Hair & Dreadlocks Studio** — « Votre couronne, votre identité. »
> Logiciel de gestion intégrée du salon : rendez-vous, clients, caisse, facturation, comptabilité, personnel & commissions, stock, fidélité, rapports — **Web (PWA) + Android**, en français, en FCFA, pour le Burkina Faso.

📐 [Architecture](docs/ARCHITECTURE.md) · 🗄️ [Base de données](docs/DATABASE.md) · 🗺️ [Feuille de route](docs/ROADMAP.md) · 📱 [Android](docs/ANDROID.md) · 🚀 [Mise en ligne](docs/DEPLOIEMENT.md)

## Structure
```
dread-royal/
├── apps/api        API NestJS 11 + Prisma 6 + PostgreSQL (permissions vérifiées côté serveur)
├── apps/web        Next.js 14 (export statique) + Tailwind + PWA + Capacitor Android
├── packages/shared Rôles, permissions, libellés FR, calculs de vente (partagés)
├── scripts         backup.sh / restore.sh
└── docs            Documentation
```

## Installation (développement)
Prérequis : Node.js 20+ (testé 22), PostgreSQL 14+ (testé 16), `pg_dump` pour les sauvegardes.

```bash
cd dread-royal
npm install

# Base de données
sudo -u postgres psql -c "CREATE USER dreadroyal WITH PASSWORD 'dreadroyal_dev' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE dread_royal OWNER dreadroyal;"
cp apps/api/.env.example apps/api/.env      # puis générer JWT_SECRET : openssl rand -hex 48
cp apps/web/.env.local.example apps/web/.env.local

npm run build:shared
npm run db:migrate          # migrations Prisma
npm run db:seed             # rôles, compte propriétaire, catalogue Ouagadougou, catégories SYSCOHADA
npm run db:demo             # (facultatif) 45 jours d'activité fictive — base de TEST uniquement

npm run dev:api             # http://localhost:4000/api  (Swagger : /api/docs)
npm run dev:web             # http://localhost:3000
```
Premier accès : identifiant `proprietaire`, mot de passe = `OWNER_PASSWORD` du `.env` (changement imposé à la première connexion).
Avec la démo : comptes `responsable`, `caisse`, `aziz`, `rasmata`, `clarisse`, `salif` (coiffeurs), `stock` — mot de passe `Demo2026!`.

> ⚠️ `db:demo` refuse de s'exécuter sur une base contenant déjà des ventes : aucune donnée fictive en production.

## Production
👉 **Mise en ligne simple (un VPS + Docker + HTTPS automatique) : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md)** — `cd deploy && ./install.sh`.

Installation manuelle sans Docker :
- API : `npm run build:api` puis `cd apps/api && npm run start:prod` (applique les migrations puis démarre). Derrière un reverse-proxy HTTPS (Nginx/Caddy). Variables : voir `apps/api/.env.example` (`CORS_ORIGINS` = domaine du site + `https://localhost` pour Android).
- Web : `NEXT_PUBLIC_API_URL=https://api.domaine.bf/api npm run build:web` → servir `apps/web/out/` (tout hébergement statique). Installable comme application (PWA).
- Android : voir [docs/ANDROID.md](docs/ANDROID.md).
- Sauvegardes : automatiques chaque nuit (`BACKUP_CRON`), manuelles via Paramètres ou `scripts/backup.sh` ; restauration `scripts/restore.sh <fichier>`.

## Fonctionnalités
| Module | Contenu |
|---|---|
| Sécurité | Connexion identifiant/mot de passe (bcrypt), JWT 15 min + jetons de rafraîchissement rotatifs révocables, verrouillage après 5 échecs, limitation de débit, 5 rôles (Propriétaire, Responsable, Caissier, Coiffeur, Gestionnaire de stock) + rôles personnalisés, permissions modifiables et **vérifiées côté serveur**, journal d'audit avant/après |
| Tableau de bord | CA jour/mois, dépenses, résultat comptable et bénéfice estimé, caisse théorique, clients, RDV, prestations, ventes, alertes stock ; graphiques recettes/dépenses, clientèle, top prestations, performance des collaborateurs ; filtres jour/semaine/mois/année |
| Clients | Code auto, recherche nom/téléphone (+226 normalisé), préférences, historique RDV/achats/paiements, dettes, points, forfaits |
| Prestations | 52 prestations en 7 catégories, tarifs FCFA à fourchette (longueur/volume), durées, commissions |
| Rendez-vous | Vues jour (par coiffeur), semaine, mois ; 6 statuts ; **anti double réservation** (verrou PostgreSQL) ; planning personnel du coiffeur ; lien de rappel WhatsApp |
| Ventes | Prestations + produits + forfaits, coiffeur par ligne, remises (droit + motif), points fidélité, acompte, paiement partiel/multiple (Espèces, Orange Money, Moov Money, virement, autre) avec référence, monnaie à rendre, n° de facture unique ; facture A4, ticket 80 mm, reçus (PDF) ; annulation/remboursement tracés |
| Caisse | Ouverture, mouvements, clôture, solde théorique/réel, écart justifié obligatoire |
| Comptabilité | CA ≠ encaissements ≠ charges ≠ trésorerie ≠ résultat ≠ bénéfice estimé ; journaux, état de caisse, résultat mensuel/annuel, créances, dettes ; comptes SYSCOHADA indicatifs |
| Personnel & commissions | Fiches, contrats, salaires ; commissions % / fixe / individuelles, dues seulement quand la vente est soldée ; totaux jour/semaine/mois ; règlements → dépense automatique ; régularisation si annulation |
| Stock | Produits, fournisseurs, achats (CMUP, dettes), sorties, consommation interne, ajustements justifiés, inventaires, alertes, historique ; mise à jour automatique à la vente |
| Fidélité | Points configurables, récompenses, ajustements, forfaits mensuels avec suivi des passages |
| Rapports | 13 rapports filtrables, export PDF / Excel / CSV |
| Hors connexion | PWA (service worker), file IndexedDB à identifiants uniques, anti-doublon serveur, conflits signalés, indicateur et historique de synchronisation ; ventes hors ligne « en attente » jusqu'à confirmation |

## Tests (exécutés et réussis)
```bash
npm test     # 6 tests unitaires (calculs partagés) + 48 tests e2e API sur PostgreSQL réel
```
Les tests e2e (`apps/api/test/app.e2e-spec.ts`, base `dread_royal_test` recréée à chaque lancement) couvrent : authentification et rotation des jetons, verrouillage, permissions des 5 rôles côté serveur, clients, prestations, rendez-vous (chevauchement, réservations concurrentes), ventes (acompte, solde, prix hors fourchette, remise interdite, stock insuffisant, transaction annulée), PDF, annulation/remboursement, caisse et écarts, dépenses/dettes, commissions et règlement, calcul CA/encaissements/résultat/bénéfice, trésorerie, achats et CMUP, inventaire, forfaits, fidélité, synchronisation hors ligne (doublons, conflits, permissions), tableau de bord, 13 rapports et exports, sauvegarde, journal d'audit.

Tests navigateur (Playwright, nécessitent API + web + données de démo) : `apps/web/tests/ui-smoke.js` (22 écrans, vente complète à la caisse, mobile, menu restreint du coiffeur) et `apps/web/tests/offline.js` (création hors ligne → synchronisation).

## Limites connues
- Compilation APK/AAB non réalisée dans l'environnement de développement (SDK Android inaccessible) : procédure dans `docs/ANDROID.md`.
- Rappels WhatsApp : lien manuel `wa.me` ; l'envoi automatique (API WhatsApp Business) reste à brancher.
- Comptabilité : présentation de gestion compatible SYSCOHADA (comptes indicatifs), pas une comptabilité en partie double ; à valider par un professionnel comptable.
