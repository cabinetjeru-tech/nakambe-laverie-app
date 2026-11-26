#!/usr/bin/env bash
# Restauration d'une sauvegarde DREAD ROYAL.
# ATTENTION : remplace TOUTES les données actuelles de la base par celles de la sauvegarde.
# Une sauvegarde de sécurité de l'état actuel est faite automatiquement avant restauration.
# Usage : scripts/restore.sh backups/dreadroyal-....dump
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Indiquez le fichier .dump à restaurer}"
[ -f "$FILE" ] || { echo "Fichier introuvable : $FILE"; exit 1; }
URL=$(grep -E '^DATABASE_URL=' apps/api/.env | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')
echo "Vous allez REMPLACER toutes les données de la base par : $FILE"
read -r -p "Tapez RESTAURER pour confirmer : " ok
[ "$ok" = "RESTAURER" ] || { echo "Annulé."; exit 1; }
scripts/backup.sh backups/avant-restauration
echo "Arrêtez l'API avant de continuer (Entrée pour poursuivre)…"; read -r _
pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$URL" "$FILE"
echo "Restauration terminée. Redémarrez l'API."
