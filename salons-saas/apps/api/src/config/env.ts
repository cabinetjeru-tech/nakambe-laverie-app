import { Logger } from '@nestjs/common';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const base64Key32 = z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
  message: 'doit être une clé de 32 octets encodée en base64 (openssl rand -base64 32)',
});

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3002),
    /** Connexion de l'API : rôle salons_app, SOUMIS à la Row-Level Security. */
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** Clé maîtresse qui chiffre la clé de données de chaque tenant. */
    MASTER_KEY: base64Key32,
    /** Secret mélangé aux empreintes des jetons et codes (HMAC). */
    HASH_PEPPER: z.string().min(32),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    COOKIE_SECURE: booleanString.optional(),
    TRUST_PROXY: booleanString.default('false'),
    APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    /** console : les codes sont écrits dans les journaux ; memory : conservés en mémoire (tests). */
    OTP_DRIVER: z.enum(['console', 'memory']).default('console'),
    DEFAULT_PLAN_CODE: z.string().default('SALON'),
    TRIAL_DAYS: z.coerce.number().int().min(0).default(30),

    // ---- Facturation de la plateforme (abonnements SaaS) ----
    /** Connexion salons_platform (BYPASSRLS) : moteur de facturation et console éditeur uniquement. */
    PLATFORM_DATABASE_URL: z.string().min(1),
    /** Planificateur (renouvellements, relances, suspensions) : off dans les tests. */
    BILLING_SCHEDULER: z.enum(['on', 'off']).default('on'),
    BILLING_TICK_SECONDS: z.coerce.number().int().min(10).default(300),
    /** Facture de renouvellement émise N jours avant l'échéance. */
    BILLING_RENEWAL_LEAD_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    /** Délai de grâce après une échéance impayée, avant la suspension automatique. */
    BILLING_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(3),
    /** TVA appliquée aux factures de la plateforme (0 tant que le régime fiscal n'est pas arrêté). */
    BILLING_VAT_PERCENT: z.coerce.number().min(0).max(30).default(0),
    PLATFORM_LEGAL_NAME: z.string().default('Éditeur de la plateforme'),
    PLATFORM_ADDRESS: z.string().default(''),
    PLATFORM_TAX_ID: z.string().default(''),
    /** Numéros de réception Mobile Money, ex. « Orange Money:+22670000000;Moov Money:+22660000000 ». */
    PLATFORM_MOBILE_MONEY: z.string().default(''),
    /** Paiement en ligne : none, cinetpay, ou sandbox (simulateur, interdit en production). */
    PAYMENT_PROVIDER: z.enum(['none', 'cinetpay', 'sandbox']).default('none'),
    CINETPAY_API_KEY: z.string().default(''),
    CINETPAY_SITE_ID: z.string().default(''),
    /** Adresse publique de l'API (URL de notification de l'agrégateur). */
    API_PUBLIC_URL: z.string().url().default('http://localhost:3002'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.OTP_DRIVER === 'memory') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['OTP_DRIVER'], message: 'interdit en production' });
    }
    if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'sandbox') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['PAYMENT_PROVIDER'], message: 'le simulateur est interdit en production' });
    }
    if (env.PAYMENT_PROVIDER === 'cinetpay' && (!env.CINETPAY_API_KEY || !env.CINETPAY_SITE_ID)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CINETPAY_API_KEY'], message: 'CINETPAY_API_KEY et CINETPAY_SITE_ID sont requis' });
    }
    if (env.NODE_ENV === 'production' && env.COOKIE_SECURE === false) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['COOKIE_SECURE'], message: 'doit être true en production' });
    }
  });

export type AppConfig = Omit<z.infer<typeof envSchema>, 'COOKIE_SECURE' | 'CORS_ORIGINS'> & {
  COOKIE_SECURE: boolean;
  CORS_ORIGINS: string[];
};

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Valide les variables d'environnement au démarrage : l'API refuse de démarrer si l'une est invalide. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')} : ${issue.message}`).join('\n');
    throw new Error(`Configuration invalide (voir .env.example) :\n${details}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.OTP_DRIVER === 'console') {
    new Logger('Config').warn(
      "OTP_DRIVER=console : les codes de réinitialisation sont écrits dans les journaux du serveur. " +
        'Brancher un fournisseur SMS/WhatsApp dès que possible.',
    );
  }
  return {
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    CORS_ORIGINS: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  };
}
