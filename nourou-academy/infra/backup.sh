#!/bin/sh
# Sauvegarde quotidienne : base de données + fichiers téléversés, rotation sur 14 jours.
# Exemple crontab (hôte) : 30 2 * * * /opt/nourou/infra/backup.sh >> /var/log/nourou-backup.log 2>&1
set -eu
DIR=${BACKUP_DIR:-/opt/nourou/backups}
COMPOSE="docker compose -f $(dirname "$0")/docker-compose.prod.yml --env-file $(dirname "$0")/../.env.production"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DIR"
$COMPOSE exec -T db pg_dump -U "${POSTGRES_USER:-nourou}" -Fc "${POSTGRES_DB:-nourou_academy}" > "$DIR/db-$STAMP.dump"
$COMPOSE exec -T app tar -C /app -czf - storage > "$DIR/storage-$STAMP.tgz"
find "$DIR" -type f -mtime +14 -delete
echo "Sauvegarde OK : $STAMP"
# Recommandé : copier $DIR hors du serveur (rclone vers un stockage S3, par exemple).
