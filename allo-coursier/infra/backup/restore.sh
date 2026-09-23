#!/bin/sh
# Restauration d'une sauvegarde de la base (ATTENTION : remplace les données actuelles).
# Usage : infra/backup/restore.sh /var/backups/allo-coursier/base-AAAAMMJJ-HHMM.dump
set -eu
[ $# -eq 1 ] || { echo "Usage : $0 fichier.dump"; exit 1; }
cd "$(dirname "$0")/../.."
COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
printf "Restaurer %s et remplacer la base actuelle ? Tapez OUI : " "$1"
read -r answer
[ "$answer" = "OUI" ] || { echo "Annulé."; exit 1; }
$COMPOSE stop api
$COMPOSE exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < "$1"
$COMPOSE start api
echo "Restauration terminée."
