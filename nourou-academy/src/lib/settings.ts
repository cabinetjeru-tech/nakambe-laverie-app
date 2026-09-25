import "server-only";
import { prisma } from "./db";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto";

/**
 * Paramètres modifiables depuis l'administration.
 * - Les paramètres "publics" (marque, couleurs…) peuvent être envoyés au navigateur.
 * - Les secrets (clés API) sont chiffrés en base (AES-256-GCM) et ne quittent jamais le serveur.
 */

export type BrandSettings = {
  name: string;
  shortName: string;
  slogan: string;
  promoter: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  facebook: string;
  linkedin: string;
  youtube: string;
  certificateSignatory: string;
  certificateSignatoryTitle: string;
  tutorName: string;
};

export const defaultBrand: BrandSettings = {
  name: "NOUROU GLOBAL ACADEMY",
  shortName: "Nourou Academy",
  slogan: "Apprenez aujourd'hui, maîtrisez demain.",
  promoter: "NOUROU GLOBAL CONSULTING",
  logoUrl: null,
  primaryColor: "#0B2447",
  secondaryColor: "#2F80ED",
  accentColor: "#E3A33B",
  email: "contact@nourou-academy.com",
  phone: "+226 00 00 00 00",
  whatsapp: "",
  address: "Ouagadougou, Burkina Faso",
  facebook: "",
  linkedin: "",
  youtube: "",
  certificateSignatory: "La Direction pédagogique",
  certificateSignatoryTitle: "NOUROU GLOBAL CONSULTING",
  tutorName: "Noura IA",
};

export type AiSettings = {
  provider: "anthropic" | "openai";
  anthropicModel: string;
  anthropicEffort: "low" | "medium" | "high";
  openaiModel: string;
  embeddingModel: string;
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
  learnerDailyMessages: number;
  trainerDailyGenerations: number;
  monthlyTokenBudget: number; // 0 = illimité
  maxContextMessages: number;
};

export const defaultAi: AiSettings = {
  provider: "anthropic",
  anthropicModel: "claude-opus-5",
  anthropicEffort: "medium",
  openaiModel: "gpt-5-mini",
  embeddingModel: "text-embedding-3-small",
  sttModel: "gpt-4o-mini-transcribe",
  ttsModel: "gpt-4o-mini-tts",
  ttsVoice: "alloy",
  learnerDailyMessages: 60,
  trainerDailyGenerations: 40,
  monthlyTokenBudget: 0,
  maxContextMessages: 16,
};

export type PaymentSettings = {
  enabled: string[]; // identifiants de prestataires activés : cinetpay, paydunya, wave
  cinetpaySiteId: string;
  paydunyaMode: "test" | "live";
  paydunyaStoreName: string;
  waveCountryNote: string;
};

export const defaultPayments: PaymentSettings = {
  enabled: [],
  cinetpaySiteId: "",
  paydunyaMode: "test",
  paydunyaStoreName: "NOUROU GLOBAL ACADEMY",
  waveCountryNote: "",
};

export type TechnicalSettings = {
  registrationsOpen: boolean;
  maintenanceMessage: string;
  maxUploadMb: number;
  jitsiDomain: string;
  jitsiAppId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpSecure: boolean;
};

export const defaultTechnical: TechnicalSettings = {
  registrationsOpen: true,
  maintenanceMessage: "",
  maxUploadMb: 50,
  jitsiDomain: process.env.JITSI_DOMAIN || "meet.jit.si",
  jitsiAppId: "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || "",
  smtpFrom: process.env.SMTP_FROM || "",
  smtpSecure: process.env.SMTP_SECURE === "true",
};

/** Clés secrètes gérées par l'administration, avec leur variable d'environnement de repli. */
export const SECRET_KEYS = {
  "ai.anthropicKey": "ANTHROPIC_API_KEY",
  "ai.openaiKey": "OPENAI_API_KEY",
  "payments.cinetpay.apiKey": "CINETPAY_API_KEY",
  "payments.cinetpay.secretKey": "CINETPAY_SECRET_KEY",
  "payments.paydunya.masterKey": "PAYDUNYA_MASTER_KEY",
  "payments.paydunya.privateKey": "PAYDUNYA_PRIVATE_KEY",
  "payments.paydunya.token": "PAYDUNYA_TOKEN",
  "payments.wave.apiKey": "WAVE_API_KEY",
  "payments.wave.webhookSecret": "WAVE_WEBHOOK_SECRET",
  "live.jitsiAppSecret": "JITSI_APP_SECRET",
  "smtp.password": "SMTP_PASSWORD",
} as const;
export type SecretKey = keyof typeof SECRET_KEYS;

const cache = new Map<string, { value: unknown; at: number }>();
const TTL = 15_000;

async function readRaw(key: string): Promise<unknown | undefined> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const row = await prisma.setting.findUnique({ where: { key } });
  const value = row?.value;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export function invalidateSettingsCache() {
  cache.clear();
}

async function getGroup<T extends object>(key: string, defaults: T): Promise<T> {
  const raw = (await readRaw(key)) as Partial<T> | undefined;
  return { ...defaults, ...(raw ?? {}) };
}

export const getBrand = () => getGroup("brand", defaultBrand);
export const getAiSettings = () => getGroup("ai", defaultAi);
export const getPaymentSettings = () => getGroup("payments", defaultPayments);
export const getTechnicalSettings = () => getGroup("technical", defaultTechnical);

export async function saveGroup(key: "brand" | "ai" | "payments" | "technical", value: object) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object, isSecret: false },
    update: { value: value as object },
  });
  invalidateSettingsCache();
}

export async function getSecret(key: SecretKey): Promise<string | null> {
  const raw = (await readRaw(`secret:${key}`)) as { enc?: string } | undefined;
  if (raw?.enc) {
    try {
      return decryptSecret(raw.enc);
    } catch {
      console.error(`[settings] Impossible de déchiffrer le secret ${key} (clé de chiffrement modifiée ?)`);
    }
  }
  const envName = SECRET_KEYS[key];
  const fromEnv = process.env[envName];
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

export async function setSecret(key: SecretKey, value: string | null) {
  const k = `secret:${key}`;
  if (!value) {
    await prisma.setting.deleteMany({ where: { key: k } });
  } else {
    const enc = encryptSecret(value);
    await prisma.setting.upsert({
      where: { key: k },
      create: { key: k, value: { enc }, isSecret: true },
      update: { value: { enc } },
    });
  }
  invalidateSettingsCache();
}

/** État des secrets pour l'interface d'administration : jamais la valeur, seulement un masque. */
export async function secretStatuses(): Promise<Record<SecretKey, { configured: boolean; source: "admin" | "env" | null; masked: string | null }>> {
  const out = {} as Record<SecretKey, { configured: boolean; source: "admin" | "env" | null; masked: string | null }>;
  for (const key of Object.keys(SECRET_KEYS) as SecretKey[]) {
    const raw = (await readRaw(`secret:${key}`)) as { enc?: string } | undefined;
    if (raw?.enc) {
      let masked: string | null = "••••••";
      try {
        masked = maskSecret(decryptSecret(raw.enc));
      } catch {
        masked = "(illisible)";
      }
      out[key] = { configured: true, source: "admin", masked };
    } else if (process.env[SECRET_KEYS[key]]) {
      out[key] = { configured: true, source: "env", masked: maskSecret(process.env[SECRET_KEYS[key]]) };
    } else {
      out[key] = { configured: false, source: null, masked: null };
    }
  }
  return out;
}
