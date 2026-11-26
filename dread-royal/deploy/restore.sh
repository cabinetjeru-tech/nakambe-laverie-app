#!/usr/bin/env bash
# Restaure une sauvegarde. ATTENTION : remplace toutes les données actuelles.
# L'état actuel est d'abord sauvegardé automatiquement.
# Usage : ./restore.sh backups/dreadroyal-....dump
set -euo pipefail
cd "$(dirname "$0")"
FILE="${1:?Indiquez le fichier .dump à restaurer}"
[ -f "$FILE" ] || { echo "Fichier introuvable : $FILE"; exit 1; }
echo "Toutes les données actuelles vont être REMPLACÉES par : $FILE"
read -r -p "Tapez RESTAURER pour confirmer : " ok
[ "$ok" = "RESTAURER" ] || { echo "Annulé."; exit 1; }
./backup.sh
docker compose stop api
docker compose exec -T db pg_restore -U dreadroyal --clean --if-exists --no-owner --single-transaction -d dread_royal < "$FILE"
docker compose start api
echo "✅ Restauration terminée."
