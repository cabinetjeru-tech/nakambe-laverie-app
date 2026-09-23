/** Vérifie au démarrage que les variables d'environnement indispensables sont présentes. */
export function validateEnv(config: Record<string, unknown>) {
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET'];
  const missing = required.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')} (voir .env.example)`);
  }
  if (config.NODE_ENV === 'production' && String(config.JWT_ACCESS_SECRET).length < 32) {
    throw new Error('JWT_ACCESS_SECRET doit contenir au moins 32 caractères en production.');
  }
  return config;
}
