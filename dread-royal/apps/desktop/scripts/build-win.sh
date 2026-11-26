#!/usr/bin/env bash
# Construit l'installateur Windows : release/DREAD-ROYAL-Installation-<version>.exe
# Fonctionne sous Linux sans wine (NSIS génère le désinstallateur sur le PC lors de l'installation).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
VERSION=$(node -p "require('./package.json').version")
bash scripts/stage.sh win
rm -rf release/win-unpacked
npx electron-builder --win dir --x64
# electron-builder écarte le client Prisma généré (.prisma) et le paquet local @dread-royal/shared :
# on recopie toute dépendance manquante, puis on vérifie les éléments indispensables
cp -rn build/app/node_modules/. release/win-unpacked/resources/app/node_modules/
for f in .prisma/client/index.js @dread-royal/shared/dist/index.js @prisma/client/runtime/library.js pg/package.json; do
  test -e "release/win-unpacked/resources/app/node_modules/$f" || { echo "ERREUR : $f absent du paquet"; exit 1; }
done
test -f release/win-unpacked/resources/app/node_modules/.prisma/client/query_engine-windows.dll.node || { echo "ERREUR : moteur Prisma Windows absent"; exit 1; }
node scripts/set-exe-icon.js "release/win-unpacked/DREAD ROYAL.exe" build/resources/icon.ico "$VERSION"
NSIS=$(ls -d ~/.cache/electron-builder/nsis/nsis-3* | head -1)
MAKENSIS="$NSIS/linux/makensis"; [ "$(uname)" = Darwin ] && MAKENSIS="$NSIS/mac/makensis"
command -v makensis >/dev/null && MAKENSIS=makensis
chmod +x "$MAKENSIS" 2>/dev/null || true
OUT="$HERE/release/DREAD-ROYAL-Installation-$VERSION.exe"
NSISDIR="$NSIS" "$MAKENSIS" -V2 -DVERSION="$VERSION" -DOUTFILE="$OUT" -DSRCDIR="$HERE/release/win-unpacked" -DICON="$HERE/build/resources/icon.ico" scripts/installer.nsi
ls -lh "$OUT"
