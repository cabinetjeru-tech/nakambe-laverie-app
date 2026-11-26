#!/usr/bin/env bash
# Met à jour DREAD ROYAL : sauvegarde, récupère le nouveau code, reconstruit, redémarre (migrations automatiques).
set -euo pipefail
cd "$(dirname "$0")"
echo "▶ Sauvegarde de sécurité"
docker compose exec -T api node -e "1" >/dev/null 2>&1 && ./backup.sh || echo "(API arrêtée : pas de sauvegarde préalable)"
echo "▶ Récupération du code"
git pull --ff-only
echo "▶ Reconstruction et redémarrage"
docker compose up -d --build
docker image prune -f >/dev/null
echo "✅ Mise à jour terminée"
