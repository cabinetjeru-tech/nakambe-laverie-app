# DREAD ROYAL — Application Android (Capacitor 7)

L'application Android embarque l'export statique du frontend (`apps/web/out`) et appelle **la même API** (et donc la même base PostgreSQL) que la version web.

## Prérequis (poste de compilation)
- Node.js 20+, JDK 17 ou 21, Android Studio (SDK Android 35, build-tools), variable `ANDROID_HOME`.

## Compiler
```bash
cd apps/web
# 1. URL publique HTTPS de l'API de production (obligatoire : Android refuse le HTTP non chiffré)
echo "NEXT_PUBLIC_API_URL=https://api.votre-domaine.bf/api" > .env.local
# 2. Build web + copie dans le projet Android
npm run cap:sync
# 3a. APK de test (installable directement sur un téléphone)
cd android && ./gradlew assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
# 3b. AAB signé pour le Play Store
./gradlew bundleRelease                         # → app/build/outputs/bundle/release/app-release.aab
```
Pour la signature : créer une clé (`keytool -genkey -v -keystore dreadroyal.jks -alias dreadroyal -keyalg RSA -keysize 2048 -validity 10000`) et la déclarer dans `android/app/build.gradle` (`signingConfigs`) — **ne jamais versionner la clé ni ses mots de passe**.

## Points importants
- Identifiant d'application : `bf.dreadroyal.management` ; nom affiché : « Dread Royal » ; icônes et écran de démarrage aux couleurs du logo (noir/or).
- L'adresse du serveur peut être modifiée sur l'écran de connexion (« Adresse du serveur »), utile pour un serveur local au salon.
- CORS : l'API autorise par défaut `https://localhost` et `capacitor://localhost` (origines de l'application Android/iOS) — voir `CORS_ORIGINS`.
- Hors connexion : la file d'opérations (IndexedDB) fonctionne aussi dans l'application Android.

## État
Le projet Android est généré et configuré dans `apps/web/android`. La compilation de l'APK/AAB n'a **pas** pu être exécutée dans l'environnement de développement utilisé (SDK Android non téléchargeable : accès réseau à dl.google.com bloqué). Elle doit être lancée sur un poste disposant d'Android Studio.
