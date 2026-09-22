/**
 * Paramètres modifiables depuis l'administration, avec leur valeur par défaut.
 * Toute clé absente de la base prend la valeur ci-dessous.
 */
export const SETTING_DEFINITIONS = {
  'routing.roadCoefficient': {
    default: 1.3,
    description: "Coefficient appliqué à la distance à vol d'oiseau pour estimer la distance par la route",
    validate: (v: unknown) => typeof v === 'number' && v >= 1 && v <= 3,
  },
  'auth.maxFailedAttempts': {
    default: 5,
    description: 'Nombre de codes secrets erronés avant blocage temporaire du compte',
    validate: (v: unknown) => Number.isInteger(v) && (v as number) >= 3 && (v as number) <= 20,
  },
  'auth.lockMinutes': {
    default: 15,
    description: 'Durée du blocage temporaire après trop de codes erronés (minutes)',
    validate: (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1440,
  },
  'dispatch.offerTimeoutSeconds': {
    default: 30,
    description: "Délai laissé au livreur pour accepter une mission (secondes)",
    validate: (v: unknown) => Number.isInteger(v) && (v as number) >= 10 && (v as number) <= 300,
  },
  'dispatch.searchRadiusKm': {
    default: 5,
    description: 'Rayon initial de recherche des livreurs (km)',
    validate: (v: unknown) => typeof v === 'number' && v > 0 && v <= 50,
  },
  'dispatch.maxAttempts': {
    default: 5,
    description: "Nombre de livreurs sollicités avant d'alerter l'administration",
    validate: (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 50,
  },
  'drivers.defaultCashDebtLimit': {
    default: 25000,
    description: "Montant maximal d'espèces qu'un livreur peut détenir avant de devoir les reverser (FCFA)",
    validate: (v: unknown) => Number.isInteger(v) && (v as number) >= 0,
  },
  'orders.scheduleLeadMinutes': {
    default: 30,
    description: "Pour une livraison programmée : recherche d'un livreur X minutes avant l'heure prévue",
    validate: (v: unknown) => Number.isInteger(v) && (v as number) >= 5 && (v as number) <= 240,
  },
  'payments.mobileMoney.orangeNumber': {
    default: '',
    description: "Numéro Orange Money de l'entreprise affiché aux clients (paiement manuel)",
    validate: (v: unknown) => typeof v === 'string',
  },
  'payments.mobileMoney.moovNumber': {
    default: '',
    description: "Numéro Moov Money de l'entreprise affiché aux clients (paiement manuel)",
    validate: (v: unknown) => typeof v === 'string',
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFINITIONS)[K]['default'] extends number
  ? number
  : string;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFINITIONS, key);
}
