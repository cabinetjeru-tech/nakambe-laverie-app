/**
 * Accès centralisé aux variables d'environnement côté serveur.
 * Ne jamais importer ce fichier dans un composant client.
 */
function required(name: string, devFallback?: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (process.env.NODE_ENV !== "production" && devFallback !== undefined) return devFallback;
  throw new Error(`Variable d'environnement manquante : ${name}`);
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  /** "development" | "staging" | "production" — séparation stricte des environnements */
  get appEnv() {
    return process.env.APP_ENV || (process.env.NODE_ENV === "production" ? "production" : "development");
  },
  get isProduction() {
    return this.appEnv === "production";
  },
  get sessionSecret() {
    return required("SESSION_SECRET", "dev-session-secret");
  },
  get settingsKey() {
    return required("SETTINGS_ENCRYPTION_KEY", "dev-settings-key");
  },
  get fileSigningSecret() {
    return required("FILE_SIGNING_SECRET", "dev-file-secret");
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
  /**
   * Le mode démonstration des paiements est désactivé d'office en production,
   * même si la variable est positionnée par erreur.
   */
  get paymentDemoEnabled() {
    return process.env.PAYMENT_DEMO_ENABLED === "true" && this.appEnv !== "production";
  },
};
