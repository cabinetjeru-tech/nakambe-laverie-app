import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Application Android DREAD ROYAL : embarque l'export statique (out/) et utilise
 * la même API et la même base que la version web. L'adresse de l'API est définie au build
 * (NEXT_PUBLIC_API_URL) et modifiable sur l'écran de connexion (« Adresse du serveur »).
 */
const config: CapacitorConfig = {
  appId: 'bf.dreadroyal.management',
  appName: 'Dread Royal',
  webDir: 'out',
  backgroundColor: '#0B0B0B',
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' },
};

export default config;
