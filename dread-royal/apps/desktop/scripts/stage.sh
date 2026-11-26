#!/usr/bin/env bash
# Assemble l'application de bureau dans build/app (+ binaires PostgreSQL dans build/pgsql).
# Usage : scripts/stage.sh win|linux
set -euo pipefail
TARGET="${1:-win}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BUILD="$HERE/build"
APP="$BUILD/app"
PG_VERSION="16.16.0-beta.19"
case "$TARGET" in
  win) PG_PKG="@embedded-postgres/windows-x64"; PRISMA_TARGETS='"native", "windows"' ;;
  linux) PG_PKG="@embedded-postgres/linux-x64"; PRISMA_TARGETS='"native"' ;;
  *) echo "Cible inconnue : $TARGET"; exit 1 ;;
esac

echo "▶ 1. Compilation (partagé, API, site)"
cd "$ROOT"
npm run build -w @dread-royal/shared >/dev/null
(cd apps/api && npx prisma generate >/dev/null && npx nest build)
NEXT_PUBLIC_API_URL=/api npm run build -w @dread-royal/web >/dev/null

echo "▶ 2. Assemblage dans $APP"
rm -rf "$APP" && mkdir -p "$APP/api/prisma" "$APP/node_modules/@dread-royal/shared"
cp -r "$HERE/src" "$APP/desktop"
cp -r apps/api/dist "$APP/api/dist"
cp -r apps/api/assets "$APP/api/assets"
cp -r apps/api/prisma/migrations "$APP/api/prisma/migrations"
sed "s/provider = \"prisma-client-js\"/provider = \"prisma-client-js\"\n  binaryTargets = [$PRISMA_TARGETS]/" apps/api/prisma/schema.prisma > "$APP/api/prisma/schema.prisma"
cp -r apps/web/out "$APP/web"
node -e "
const api = require('./apps/api/package.json');
const deps = { ...api.dependencies, pg: '^8.13.0' };
delete deps['@dread-royal/shared'];
const pkg = { name: 'dread-royal-desktop', productName: 'DREAD ROYAL', version: require('$HERE/package.json').version, private: true,
  description: 'DREAD ROYAL Management System', author: 'DREAD ROYAL', main: 'desktop/main.js', dependencies: deps };
require('fs').writeFileSync('$APP/package.json', JSON.stringify(pkg, null, 2));
"

echo "▶ 3. Dépendances de production"
(cd "$APP" && npm install --omit=dev --no-audit --no-fund --no-package-lock --ignore-scripts >/dev/null)
cp packages/shared/package.json "$APP/node_modules/@dread-royal/shared/" && cp -r packages/shared/dist "$APP/node_modules/@dread-royal/shared/dist"
(cd "$APP" && node node_modules/prisma/build/index.js generate --schema api/prisma/schema.prisma >/dev/null)
# Le moteur de schéma et la CLI Prisma ne sont pas utilisés à l'exécution (migrations appliquées par desktop/migrate.js)
rm -rf "$APP/node_modules/prisma" "$APP/node_modules/@prisma/engines" "$APP/node_modules/.bin"
# Allègement : cartes de débogage, moteurs Prisma inutiles (autres bases, wasm, edge)
find "$APP/node_modules" -name "*.map" -delete
find "$APP/node_modules/@prisma/client/runtime" \( -name "*mysql*" -o -name "*sqlite*" -o -name "*sqlserver*" -o -name "*cockroachdb*" -o -name "*wasm*" -o -name "edge*" -o -name "react-native*" -o -name "*.d.ts" -o -name "*.d.mts" \) -delete 2>/dev/null || true
if [ "$TARGET" = win ]; then find "$APP/node_modules/.prisma/client" -name "libquery_engine-*.so.node" -delete; fi
rm -rf "$APP/node_modules/typescript" "$APP/node_modules/@types"
ls "$APP/node_modules/.prisma/client/" | grep -E "engine|\.node" || true

echo "▶ 4. Binaires PostgreSQL ($PG_PKG@$PG_VERSION)"
rm -rf "$BUILD/pgsql" "$BUILD/pgtmp" && mkdir -p "$BUILD/pgtmp"
(cd "$BUILD/pgtmp" && npm pack "$PG_PKG@$PG_VERSION" >/dev/null && tar xzf ./*.tgz)
mv "$BUILD/pgtmp/package/native" "$BUILD/pgsql" && rm -rf "$BUILD/pgtmp"
# Liens symboliques (Linux) décrits dans pg-symlinks.json
if [ -f "$BUILD/pgsql/pg-symlinks.json" ]; then
  node -e "
  const fs=require('fs'),p=require('path');const base='$BUILD/pgsql';
  for (const l of JSON.parse(fs.readFileSync(p.join(base,'pg-symlinks.json'),'utf8'))) {
    const src=p.join(base,l.source.replace(/^native\//,'')), dst=p.join(base,l.target.replace(/^native\//,''));
    try{fs.rmSync(dst,{force:true});fs.symlinkSync(p.relative(p.dirname(dst),src),dst);}catch(e){}
  }" || true
fi
chmod +x "$BUILD/pgsql/bin/"* 2>/dev/null || true
# Bibliothèques de l'interface pgAdmin (wxWidgets) : inutiles au serveur PostgreSQL
rm -f "$BUILD/pgsql/bin/"wx*.dll

echo "▶ 5. Icône"
mkdir -p "$BUILD/resources"
python3 -c "
from PIL import Image
im=Image.open('$ROOT/apps/web/public/logo-1024.jpg').convert('RGBA')
im.save('$BUILD/resources/icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
im.resize((512,512)).save('$BUILD/resources/icon.png')
"
du -sh "$APP" "$BUILD/pgsql"
echo "✅ Application assemblée ($TARGET)"
