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
node scripts/set-exe-icon.js "release/win-unpacked/DREAD ROYAL.exe" build/resources/icon.ico "$VERSION"
NSIS=$(ls -d ~/.cache/electron-builder/nsis/nsis-3* | head -1)
MAKENSIS="$NSIS/linux/makensis"; [ "$(uname)" = Darwin ] && MAKENSIS="$NSIS/mac/makensis"
command -v makensis >/dev/null && MAKENSIS=makensis
chmod +x "$MAKENSIS" 2>/dev/null || true
OUT="$HERE/release/DREAD-ROYAL-Installation-$VERSION.exe"
NSISDIR="$NSIS" "$MAKENSIS" -V2 -DVERSION="$VERSION" -DOUTFILE="$OUT" -DSRCDIR="$HERE/release/win-unpacked" -DICON="$HERE/build/resources/icon.ico" scripts/installer.nsi
ls -lh "$OUT"
