/**
 * Environnement des tests e2e. Seules les deux connexions PostgreSQL doivent être fournies :
 *   DATABASE_URL            rôle salons_app (soumis à la RLS) — celui qu'utilise l'API
 *   DATABASE_MIGRATION_URL  rôle propriétaire des tables (migrations, remise à zéro, seed)
 *   PLATFORM_DATABASE_URL   rôle salons_platform (moteur de facturation, console éditeur)
 * La base doit être dédiée aux tests : elle est VIDÉE avant chaque exécution.
 */
for (const key of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'PLATFORM_DATABASE_URL']) {
  if (!process.env[key]) {
    throw new Error(`${key} est requis pour les tests e2e (voir test/env.ts et docs/03-AUTHENTIFICATION-ET-ACCES.md).`);
  }
}

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdefghijklmnop',
  MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
  HASH_PEPPER: 'test-pepper-0123456789abcdefghijklmnopqrstuvwxyz',
  OTP_DRIVER: 'memory',
  COOKIE_SECURE: 'false',
  DEFAULT_PLAN_CODE: 'SALON',
  THROTTLE_DISABLED: 'true',
  BILLING_SCHEDULER: 'off',
  PAYMENT_PROVIDER: 'sandbox',
  PLATFORM_MOBILE_MONEY: 'Orange Money:+22670000000',
};
for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
