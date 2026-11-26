#!/usr/bin/env bash
# Paquet Linux (même processus que Windows) — sert à tester l'application empaquetée.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/stage.sh linux
rm -rf release/linux-unpacked
npx electron-builder --linux dir --x64
# electron-builder écarte le client Prisma généré (.prisma) et le paquet local @dread-royal/shared :
# on recopie toute dépendance manquante, puis on vérifie les éléments indispensables
cp -rn build/app/node_modules/. release/linux-unpacked/resources/app/node_modules/
for f in .prisma/client/index.js @dread-royal/shared/dist/index.js @prisma/client/runtime/library.js pg/package.json; do
  test -e "release/linux-unpacked/resources/app/node_modules/$f" || { echo "ERREUR : $f absent du paquet"; exit 1; }
done
echo "✅ release/linux-unpacked"
