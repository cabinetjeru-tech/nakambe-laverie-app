# 03 — Déploiement et maintenance

## 1. Environnements
Trois environnements strictement séparés, chacun avec **sa base, ses secrets et ses clés** :
`development` (poste local), `staging` (préproduction, clés de test des prestataires), `production`.
`APP_ENV` pilote les comportements sensibles (mode démo des paiements coupé en production).

## 2. Mise en ligne sur un serveur (VPS Docker)
Serveur conseillé pour démarrer : 2 vCPU, 4 Go de RAM, 80 Go de disque, Ubuntu 24.04, un nom de domaine.

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh
# 2. Code
git clone <dépôt> /opt/nourou && cd /opt/nourou/nourou-academy
# 3. Configuration
cp .env.example .env.production
#   APP_ENV=production, APP_URL=https://academie.votre-domaine.com, PAYMENT_DEMO_ENABLED=false
#   secrets : openssl rand -base64 48 (SESSION_SECRET, SETTINGS_ENCRYPTION_KEY, FILE_SIGNING_SECRET, CRON_SECRET)
#   POSTGRES_PASSWORD=..., DOMAIN=academie.votre-domaine.com, SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, SEED_DEMO=false
# 4. DNS : enregistrement A du domaine vers l'IP du serveur
# 5. Lancement (les migrations s'appliquent au démarrage ; Caddy obtient le certificat HTTPS)
docker compose -f infra/docker-compose.prod.yml --env-file .env.production up -d --build
# 6. Compte super-administrateur (une seule fois)
docker compose -f infra/docker-compose.prod.yml --env-file .env.production exec app \
  sh -c "npx tsx --conditions=react-server prisma/seed.ts"
```
> Le seed nécessite les dépendances de développement ; alternative : lancer `npm run db:seed` depuis un poste
> connecté à la base de production via un tunnel SSH, avec `SEED_DEMO=false`.

Puis : Administration › Paramètres (identité, IA, paiements, SMTP, Jitsi), création des catégories, invitation des
formateurs.

### Autres hébergements
- **Vercel / Netlify + Supabase** : possible (build standard) ; utiliser `STORAGE_DRIVER=s3` (pas de disque
  persistant) et un planificateur externe pour `/api/cron/all`. Attention à la durée maximale des fonctions pour les
  réponses longues du tuteur et l'indexation de gros documents.
- **Railway / Render / Fly.io** : utiliser le `Dockerfile` et une base PostgreSQL avec pgvector.

## 3. Tâches planifiées
`POST /api/cron/all` avec `Authorization: Bearer <CRON_SECRET>` toutes les 5 minutes (service `cron` inclus dans le
compose de production). Sous-tâches possibles : `outbox`, `reminders`, `payments`, `subscriptions`.

## 4. Sauvegardes et restauration
`infra/backup.sh` (cron quotidien sur l'hôte) : dump PostgreSQL au format custom + archive des fichiers, rotation
14 jours. Copier le dossier de sauvegarde hors du serveur (rclone vers un stockage objet).

Restauration :
```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env.production exec -T db \
  pg_restore -U nourou -d nourou_academy --clean --if-exists < backups/db-AAAAMMJJ-HHMM.dump
docker compose -f infra/docker-compose.prod.yml --env-file .env.production exec -T app \
  tar -C /app -xzf - < backups/storage-AAAAMMJJ-HHMM.tgz
```
Tester la restauration au moins une fois par trimestre sur l'environnement de préproduction.
**Conservez `SETTINGS_ENCRYPTION_KEY`** avec les sauvegardes (dans un coffre à part) : sans elle, les clés API
enregistrées ne peuvent pas être déchiffrées.

## 5. Mises à jour
```bash
cd /opt/nourou && git pull
cd nourou-academy && docker compose -f infra/docker-compose.prod.yml --env-file .env.production up -d --build
```
Faire une sauvegarde avant toute mise à jour comportant une migration. Tester d'abord en préproduction.

## 6. Surveillance
- `GET /api/health` : état de l'application et de la base (à brancher sur un service de supervision).
- Journaux : `docker compose logs -f app`. Les erreurs sont journalisées sans données personnelles ni secrets.
- Administration : tableau de bord (alertes : IA non configurée, paiements, formations à valider, remboursements),
  rapports, journal d'audit, file des emails.

## 7. Contrôles avant ouverture au public
- [ ] `APP_ENV=production`, `PAYMENT_DEMO_ENABLED=false`, secrets uniques et forts.
- [ ] Données de démonstration non chargées (`SEED_DEMO=false`) ou supprimées.
- [ ] Paiement réel testé de bout en bout pour chaque prestataire (petit montant), webhook reçu et vérifié.
- [ ] SMTP testé ; SPF / DKIM configurés sur le domaine.
- [ ] Clés IA testées ; quotas et budget réglés.
- [ ] Sauvegarde et restauration testées.
- [ ] Pages légales validées ; déclaration du traitement de données effectuée (docs/04).
- [ ] `npm test` et les tests de bout en bout passent sur la préproduction.
