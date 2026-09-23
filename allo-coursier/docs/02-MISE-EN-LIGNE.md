# ALLÔ-COURSIER — Mise en ligne (serveur économique)

Ce guide installe toute la plateforme (base de données, API, application web, HTTPS) sur **un seul petit
serveur** : environ 4 à 7 € par mois. Il n'y a pas d'autre abonnement obligatoire.

## 1. Ce qu'il faut

| Élément | Recommandation | Coût indicatif |
|---|---|---|
| Serveur (VPS) | 2 vCPU, 4 Go de RAM, 40 Go de disque, Ubuntu 24.04 (Hetzner, Contabo, OVH…) | 4 à 7 €/mois |
| Nom de domaine | ex. `allo-coursier.com` (ou un `.bf`) | 10 à 15 €/an |
| Certificat HTTPS | Let's Encrypt, automatique via Caddy | gratuit |
| Notifications push | Web Push (VAPID) | gratuit |
| Cartes | OpenStreetMap | gratuit (voir §7) |

## 2. Préparer le serveur

```bash
# Sur le serveur, en tant qu'utilisateur avec sudo
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se reconnecter

# Pare-feu : SSH + web uniquement
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

Chez le fournisseur du nom de domaine, créez un enregistrement **A** qui pointe `allo-coursier.com`
(et éventuellement `www`) vers l'adresse IP du serveur.

## 3. Installer ALLÔ-COURSIER

```bash
sudo mkdir -p /opt && cd /opt
git clone <adresse-du-dépôt> allo-coursier-src
sudo ln -s /opt/allo-coursier-src/allo-coursier /opt/allo-coursier
cd /opt/allo-coursier

cp infra/.env.prod.example infra/.env.prod
nano infra/.env.prod        # remplir DOMAIN, POSTGRES_PASSWORD, JWT_ACCESS_SECRET, SEED_ADMIN_*
```

Générer les secrets :

```bash
openssl rand -base64 24   # → POSTGRES_PASSWORD
openssl rand -base64 48   # → JWT_ACCESS_SECRET
```

Démarrer :

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

Au premier démarrage, l'API crée les tables automatiquement. Chargez ensuite les données initiales :
rôles, villes de Ouagadougou et Tenkodogo, tarifs d'exemple et compte super-administrateur.

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec api npm run prisma:seed
```

Le seed se relance sans risque : il ne duplique rien et ne modifie pas vos réglages. En production, il ne
crée **aucun** compte de démonstration.

## 4. Activer les notifications push

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod run --rm api npx web-push generate-vapid-keys
```

Copiez les deux clés dans `infra/.env.prod` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), puis :

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d api
```

## 5. Premiers réglages (dans l'administration)

Ouvrez `https://votre-domaine/admin` et connectez-vous avec le compte `SEED_ADMIN_*`.

1. **Paramètres** : changez immédiatement le mot de passe du super-administrateur.
2. **Paramètres** : saisissez les numéros **Orange Money** et **Moov Money** de l'entreprise. Le paiement
   Mobile Money n'apparaît aux clients qu'après cette étape.
3. **Tarifs** : remplacez les tarifs d'exemple (« démo ») par vos vrais prix, pour chaque ville et véhicule.
   Testez-les avec le simulateur.
4. **Villes et zones** (facultatif) : dessinez les quartiers desservis. Sans zone, une ville couvre tout son
   rayon de service.
5. **Équipe et rôles** : créez les comptes de l'équipe (dispatcheur, service client, finances, responsable
   de ville). Chacun reçoit un mot de passe provisoire.
6. **Livreurs** : créez les livreurs salariés, ou validez les inscriptions des indépendants.

## 6. Sauvegardes

Programmez la sauvegarde quotidienne de la base et des photos :

```bash
sudo crontab -e
# ajouter la ligne :
30 2 * * * /opt/allo-coursier/infra/backup/backup.sh >> /var/log/allo-backup.log 2>&1
```

Les sauvegardes sont écrites dans `/var/backups/allo-coursier` et gardées 14 jours. **Copiez-les
régulièrement hors du serveur**, par exemple en téléchargeant le dossier chaque semaine. Une sauvegarde
restée sur le serveur ne protège pas contre la perte du serveur.

Pour restaurer une sauvegarde : `infra/backup/restore.sh /var/backups/allo-coursier/base-AAAAMMJJ-HHMM.dump`.

## 7. Points de vigilance

- **Tuiles de carte** : le serveur de tuiles public d'OpenStreetMap convient au lancement. Ses règles
  d'usage interdisent un trafic intensif. Si le volume grossit, passez à un fournisseur de tuiles (offres
  gratuites ou peu chères) : il suffit de changer l'URL des tuiles dans
  `apps/web/components/map/leaflet-map.tsx`.
- **Distances** : elles sont estimées à vol d'oiseau × 1,3, un coefficient réglable dans Paramètres.
  Pour des itinéraires réels, un serveur OSRM (gratuit, avec la carte du Burkina Faso) peut être branché
  sur l'interface `RoutingProvider`.
- **Une seule instance de l'API** : les tâches automatiques (offres expirées, livraisons programmées…)
  tournent dans l'API. Ne lancez pas plusieurs copies de l'API sans adapter ce point.
- **GPS des livreurs** : dans une application web, la position n'est envoyée que lorsque l'application est
  ouverte. L'écran reste allumé pendant les missions. Pour un suivi écran éteint, voir le §9.

## 8. Mettre à jour

```bash
cd /opt/allo-coursier-src && git pull
cd /opt/allo-coursier
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

Les nouvelles migrations de base de données s'appliquent automatiquement au redémarrage de l'API.
Pensez à faire une sauvegarde juste avant.

Surveillance : `https://votre-domaine/api/v1/health` renvoie `{"status":"ok"}`. Un service gratuit de
surveillance (UptimeRobot, par exemple) peut vous alerter si la plateforme ne répond plus.

Journaux : `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod logs -f api`.

## 9. Évolutions prévues

- **Paiement Mobile Money automatique** : dès la signature d'un contrat avec Orange Money, Moov Money ou
  un agrégateur agréé, compléter `apps/api/src/modules/payments/providers/` avec leur documentation
  officielle.
- **Vérification par SMS (OTP)** : la table `otp_codes` et l'emplacement du fournisseur sont prévus.
  Il reste à brancher un fournisseur SMS.
- **Application livreur en fichier APK** (GPS écran éteint) : emballer l'espace `/livreur` avec
  Capacitor, sans réécriture, puis proposer le fichier au téléchargement ou le publier sur le Play Store.
- **Phase 2** : restaurants et commerçants. Les tables du catalogue, des menus et des horaires existent
  déjà ; il reste à construire les écrans.
