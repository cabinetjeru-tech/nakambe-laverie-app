#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DREAD ROYAL — installation sur un serveur Ubuntu/Debian neuf (VPS)
# Usage (en root, depuis le dossier dread-royal/deploy) :   ./install.sh
# Variables facultatives pour une installation sans questions :
#   DOMAIN=gestion.mondomaine.com OWNER_PASSWORD=... ./install.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"
say() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Lancez ce script en root (sudo ./install.sh)"; exit 1; }

say "1/6 Mémoire d'échange (utile sur les petits serveurs pour la compilation)"
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 3000 ] && ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap de 2 Go activé."
else echo "OK"; fi

say "2/6 Docker"
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version

say "3/6 Pare-feu (SSH, HTTP, HTTPS)"
if command -v ufw >/dev/null; then ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443 >/dev/null; ufw --force enable >/dev/null; ufw status | head -5; else echo "ufw absent : ouvrez les ports 80 et 443 chez votre hébergeur si besoin"; fi

say "4/6 Configuration (.env)"
if [ ! -f .env ]; then
  DOMAIN=${DOMAIN:-}
  [ -n "$DOMAIN" ] || read -r -p "Nom de domaine (ex : gestion.dreadroyal.com) : " DOMAIN
  OWNER_PASSWORD=${OWNER_PASSWORD:-$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 10)7a}
  cat > .env <<EOT
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
OWNER_USERNAME=proprietaire
OWNER_PASSWORD=${OWNER_PASSWORD}
EOT
  chmod 600 .env
  echo "Fichier .env créé (secrets générés aléatoirement)."
else echo ".env existant conservé."; fi
set -a; . ./.env; set +a
IP=$(curl -fsS -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
DNS=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')
if [ "$DNS" != "$IP" ]; then
  echo "⚠️  Le domaine $DOMAIN pointe vers '${DNS:-rien}' alors que ce serveur est $IP."
  echo "    Créez un enregistrement DNS de type A : $DOMAIN → $IP (le HTTPS ne fonctionnera qu'après)."
fi

say "5/6 Construction et démarrage (5 à 10 minutes la première fois)"
docker compose up -d --build

say "6/6 Vérification"
for i in $(seq 1 60); do
  if docker compose exec -T api node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then ok=1; break; fi
  sleep 3
done
[ "${ok:-}" = 1 ] || { echo "L'API ne répond pas : docker compose logs api"; exit 1; }
cat <<EOT

✅ DREAD ROYAL est en ligne : https://${DOMAIN}

   Identifiant : ${OWNER_USERNAME}
   Mot de passe provisoire : ${OWNER_PASSWORD}
   (un nouveau mot de passe vous sera demandé à la première connexion)

   Sauvegardes automatiques chaque nuit à 02:00 dans $(pwd)/backups
   Mise à jour : ./update.sh     Restauration : ./restore.sh backups/<fichier>.dump
EOT
