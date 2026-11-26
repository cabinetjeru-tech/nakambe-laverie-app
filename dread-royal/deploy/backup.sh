#!/usr/bin/env bash
# Sauvegarde immédiate de la base (fichier dans deploy/backups/).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
F="backups/dreadroyal-$(date -u +%Y-%m-%dT%H-%M-%S)-manual.dump"
docker compose exec -T db pg_dump -U dreadroyal --format=custom --no-owner dread_royal > "$F"
echo "Sauvegarde créée : $F ($(du -h "$F" | cut -f1))"
