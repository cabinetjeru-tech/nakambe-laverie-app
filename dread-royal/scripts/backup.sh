#!/usr/bin/env bash
# Sauvegarde manuelle de la base DREAD ROYAL (format pg_dump custom).
# Usage : scripts/backup.sh [dossier]   — lit DATABASE_URL dans apps/api/.env
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${1:-backups}"
mkdir -p "$DIR"
URL=$(grep -E '^DATABASE_URL=' apps/api/.env | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')
FILE="$DIR/dreadroyal-$(date -u +%Y-%m-%dT%H-%M-%S)-manual.dump"
pg_dump --format=custom --no-owner --file="$FILE" "$URL"
echo "Sauvegarde créée : $FILE"
