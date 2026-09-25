# NOUROU GLOBAL ACADEMY

**Apprenez aujourd'hui, maîtrisez demain.** — plateforme de formation en ligne de NOUROU GLOBAL CONSULTING, avec
**Noura IA**, un tuteur pédagogique connecté aux contenus des cours.

Application indépendante des autres projets de ce dépôt.

| Document | Contenu |
|---|---|
| [01 — Architecture](docs/01-ARCHITECTURE.md) | Modules, base de données, choix techniques, fonctionnement du tuteur IA et du RAG |
| [02 — Configuration des API](docs/02-CONFIGURATION-API.md) | IA (Anthropic / OpenAI), paiements (CinetPay, PayDunya, Wave), emails, Jitsi, stockage S3 |
| [03 — Déploiement et maintenance](docs/03-DEPLOIEMENT-MAINTENANCE.md) | Mise en ligne, HTTPS, tâches planifiées, sauvegardes et restauration, mises à jour |
| [04 — Sécurité et données personnelles](docs/04-SECURITE-DONNEES.md) | Mesures de sécurité, protection des données, obligations à vérifier |

## Ce que contient la plateforme

**Site public** : accueil, catalogue avec recherche et filtres, fiche détaillée de formation (objectifs, programme,
prérequis, formateur, prix, modalités, certificat, avis), formateurs, présentation du tuteur IA, tarifs
(unité, packs, abonnements), avis vérifiés, blog et ressources, FAQ, contact (tickets), vérification publique des
certificats, pages légales, inscription / connexion / mot de passe oublié. Application installable (PWA).

**Espace apprenant** : tableau de bord et reprise automatique de la dernière leçon ; mes formations et progression ;
lecteur de leçon (vidéo avec vitesse, sous-titres, reprise, sauvegarde de la position), textes, supports
téléchargeables et « garder hors ligne » ; quiz corrigés instantanément (questions ouvertes corrigées par l'IA) ;
devoirs avec dépôt de fichiers et pré-correction IA (analyse d'images pour les travaux visuels) ; notes
personnelles ; favoris ; planning et classes virtuelles (Jitsi intégré, agenda .ics) ; résultats ; certificats PDF
avec QR code ; messagerie ; notifications ; paiements et factures PDF ; demandes de remboursement ; profil,
mode faible consommation, export et suppression des données.

**Noura IA** (tuteur) : accessible partout (bouton flottant) et en plein écran avec historique. Recherche hybride
(vectorielle pgvector + plein texte français) dans les supports **des seules formations accessibles à l'apprenant**,
citations [S1]… avec lien vers la leçon, distinction cours / connaissances générales, signalement des informations
absentes ; adaptation au niveau ; modes « explique autrement », « plus simple », « exemples concrets »,
« exercice », « interroge-moi », « mes lacunes » (à partir des erreurs de quiz et devoirs), « remédiation »,
« mon parcours » ; pièces jointes image / PDF ; voix (transcription et synthèse serveur avec OpenAI, sinon voix du
navigateur quand elle existe) ; quotas et budget.

**Espace formateur** : création de formations, modules et leçons (ordre modifiable), éditeur Markdown avec aperçu,
téléversement de vidéos / sous-titres / supports avec barre de progression, éditeur de quiz (QCM, vrai/faux,
réponse courte, question ouverte avec barème) et de devoirs (barème par critère), base de connaissances IA
(PDF, DOCX, PPTX, TXT, MD), critères de certificat, workflow brouillon → soumission → validation → publication →
archivage, corrections et validation humaine, classes virtuelles (présences, replay), **assistant pédagogique IA**
(plans de cours, programmes, leçons, quiz corrigés, exercices, études de cas, fiches de révision, supports,
grilles d'évaluation — relecture, validation puis publication dans une formation), statistiques.

**Administration** : tableau de bord ; utilisateurs et rôles (super-administrateur, administrateur, formateur,
assistant, apprenant) ; validation des formations ; catégories ; transactions, remboursements, export CSV ;
abonnements, packs, codes promo ; certificats (approbation, révocation) ; avis ; tickets ; signalements ;
notifications et suivi des emails ; blog et FAQ ; rapports (encaissements, usage de l'IA) ; journal d'audit ;
paramètres (identité, couleurs, logo, contacts, clés IA, prestataires de paiement, SMTP, Jitsi) — clés chiffrées,
jamais renvoyées au navigateur.

## Démarrer en local

Prérequis : Node.js 20+ et PostgreSQL 15+ avec l'extension **pgvector** (ou `docker compose -f infra/docker-compose.yml up -d`).

```bash
cd nourou-academy
npm install
cp .env.example .env            # puis compléter les secrets (openssl rand -base64 48)
npx prisma migrate deploy       # crée le schéma, l'index vectoriel et les politiques RLS
npm run db:seed                 # super-admin + données de démonstration
npm run dev                     # http://localhost:3000
```

Comptes de démonstration (mot de passe `Demo2026!`, modifiable via `SEED_DEMO_PASSWORD`) :
`apprenant@demo.nourou-academy.local`, `formateur.marketing@demo.nourou-academy.local`,
`assistant@demo.nourou-academy.local`. Le super-administrateur est défini par `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` (un mot de passe est généré et affiché s'il n'est pas fourni).

Les données de démonstration (5 formations, formateurs fictifs, 2 articles, 1 classe virtuelle) sont marquées
`isDemo` et utilisent des emails `@demo.nourou-academy.local`. **Aucun avis, témoignage ni chiffre n'est inventé** :
les statistiques affichées sont calculées depuis la base.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement, compilation, production |
| `npm run lint` | Vérification TypeScript |
| `npm test` | Tests unitaires (accès, prix/coupons, certificats, correction, RAG, chiffrement, signatures de webhooks, Markdown anti-XSS, fichiers) |
| `RUN_DB_TESTS=1 npm test` | + tests d'intégration base de données (paiement → droits → facture, idempotence, coupon 100 %, certificat) |
| `E2E_BASE_URL=http://localhost:3000 npx vitest run --config vitest.e2e.config.mts` | Tests de bout en bout sur un serveur lancé (pages, contrôle d'accès, fichiers privés, webhooks, tuteur) |
| `npm run db:seed` | Données initiales (idempotent) |
| `npm run rag:reindex` | Ré-indexe toute la base de connaissances (après ajout d'une clé d'embeddings) |
| `node scripts/generate-icons.mjs` | Régénère les icônes PWA depuis `public/icons/*.svg` |

## Ce qui nécessite vos identifiants

| Fonction | Ce qu'il faut fournir | Sans cela |
|---|---|---|
| Tuteur IA, correction IA, générateur | Clé **Anthropic** (ou OpenAI) | Le tuteur affiche qu'il n'est pas activé ; quiz objectifs corrigés normalement, questions ouvertes corrigées par le formateur |
| Recherche sémantique, voix serveur | Clé **OpenAI** | Recherche plein texte ; voix du navigateur si disponible |
| Paiements réels | Compte marchand **CinetPay**, **PayDunya** et/ou **Wave** (éligibilité à vérifier) | Seul le mode démonstration (hors production) est disponible |
| Emails | Serveur **SMTP** | Emails conservés en file d'attente (envoyés dès la configuration) |
| Visio avec authentification / enregistrement | Jitsi auto-hébergé ou JaaS (App ID + secret) | Jitsi public meet.jit.si (sans garantie d'enregistrement) |
| Stockage objet | Bucket S3 compatible | Stockage sur le disque du serveur |

## Structure

```
nourou-academy/
├── prisma/            schéma, migrations (pgvector, plein texte, RLS), données de démonstration
├── src/app/           pages (App Router) : (public), (auth), espace, formateur, admin, api, actions (Server Actions)
├── src/components/    interface : ui, layout, course, learn, tutor, forms
├── src/lib/           serveur : auth, access, ai (llm, tutor, grading, generator, speech, quotas), rag,
│                      payments (providers, checkout, factures), certificates, live (Jitsi), storage, mail…
├── public/            service worker, icônes
├── tests/             unitaires, intégration, bout en bout
├── infra/             docker-compose (dev/prod), Caddy (HTTPS), sauvegardes
└── docs/
```

## État et suite

Livré et vérifié : voir les documents ci-dessus. Tâches restantes recommandées avant la mise en production :

1. Renseigner les clés (IA, paiements, SMTP) et tester chaque prestataire en mode test puis réel.
2. Remplacer les formations et formateurs de démonstration par les contenus réels ; ajouter logo et visuels.
3. Faire valider par un juriste la politique de confidentialité, les CGU/CGV et les mentions de facture (IFU, RCCM).
4. Déclarer le traitement de données auprès de l'autorité compétente (voir docs/04).
5. Évolutions possibles : notifications push web, traduction de l'interface (le dictionnaire i18n est prêt dans
   `src/lib/i18n`), limiteur de requêtes partagé (Redis) si plusieurs instances, transcodage vidéo HLS
   multi-débits via un hébergeur vidéo.
