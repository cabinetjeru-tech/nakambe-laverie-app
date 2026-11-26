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
# makensis : paquet système (apt install nsis) de préférence, sinon celui mis en cache par electron-builder
if command -v makensis >/dev/null; then
  MAKENSIS=(makensis)
else
  NSIS=$(ls -d ~/.cache/electron-builder/nsis/nsis-3* 2>/dev/null | head -1)
  [ -n "$NSIS" ] || { echo "ERREUR : makensis introuvable (sudo apt-get install nsis)"; exit 1; }
  chmod +x "$NSIS/linux/makensis" 2>/dev/null || true
  MAKENSIS=(env NSISDIR="$NSIS" "$NSIS/linux/makensis")
fi
OUT="$HERE/release/DREAD-ROYAL-Installation-$VERSION.exe"
"${MAKENSIS[@]}" -V2 -DVERSION="$VERSION" -DOUTFILE="$OUT" -DSRCDIR="$HERE/release/win-unpacked" -DICON="$HERE/build/resources/icon.ico" scripts/installer.nsi
ls -lh "$OUT"
