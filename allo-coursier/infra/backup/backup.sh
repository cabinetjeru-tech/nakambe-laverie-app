#!/bin/sh
# Sauvegarde quotidienne de la base et des photos ALLÔ-COURSIER.
# À planifier sur le serveur (crontab -e) :
#   30 2 * * * /opt/allo-coursier/infra/backup/backup.sh >> /var/log/allo-backup.log 2>&1
# Copiez régulièrement le dossier de sauvegarde hors du serveur (autre machine, stockage externe).
set -eu
cd "$(dirname "$0")/../.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/allo-coursier}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M)"
COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
mkdir -p "$BACKUP_DIR"

$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$BACKUP_DIR/base-$STAMP.dump"
$COMPOSE exec -T api tar -czf - -C /data uploads > "$BACKUP_DIR/photos-$STAMP.tar.gz"

find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date -Iseconds) sauvegarde OK : $BACKUP_DIR/base-$STAMP.dump"
