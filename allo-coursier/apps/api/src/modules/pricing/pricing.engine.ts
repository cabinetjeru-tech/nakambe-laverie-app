/**
 * Moteur de tarification ALLÔ-COURSIER — fonctions pures, sans accès base de données.
 *
 * prix_course = max(prix_minimum, prise_en_charge + max(0, km − km_inclus) × prix_km)
 * + express (fixe + % du prix de course) + nuit + arrêts supplémentaires
 * + frais d'achat (% du montant avancé, avec minimum) + attente au-delà du temps gratuit
 * = frais de livraison, arrondis au pas supérieur
 * commission = taux × frais de livraison ; gain livreur = frais − commission
 * total à payer = frais de livraison + montant des achats avancés
 */
import { DeliverySpeed, ServiceType, VehicleType } from '@prisma/client';
import { isTimeInRange } from '../../common/utils/time';

export interface PricingRuleParams {
  baseFare: number;
  minFare: number;
  pricePerKm: number;
  includedKm: number;
  expressFixed: number;
  expressPercent: number;
  waitingFreeMinutes: number;
  waitingPricePerMinute: number;
  nightSurcharge: number;
  nightStart: string | null;
  nightEnd: string | null;
  purchaseFeePercent: number;
  purchaseFeeMin: number;
  extraStopFee: number;
  commissionPercent: number;
  roundingStep: number;
}

export interface QuoteInput {
  distanceKm: number;
  speed: DeliverySpeed;
  /** Heure locale "HH:mm" de la course (pour le supplément de nuit). */
  localTime: string;
  /** Montant avancé par le livreur pour les courses/achats (FCFA). */
  purchaseAmount?: number;
  /** Arrêts en plus du ramassage et du dépôt. */
  extraStops?: number;
  /** Minutes d'attente constatées (connues à la livraison). */
  waitingMinutes?: number;
  /** Taux propre au livreur, prioritaire sur celui de la règle. */
  commissionPercentOverride?: number | null;
}

export type PriceLineCode = 'COURSE' | 'EXPRESS' | 'NIGHT' | 'EXTRA_STOPS' | 'PURCHASE_FEE' | 'WAITING' | 'ROUNDING';

export interface PriceLine {
  code: PriceLineCode;
  label: string;
  amount: number;
}

export interface QuoteResult {
  distanceKm: number;
  speed: DeliverySpeed;
  lines: PriceLine[];
  /** Frais facturés au client pour la prestation (hors achats avancés). */
  deliveryFee: number;
  commissionPercent: number;
  commissionAmount: number;
  driverEarning: number;
  purchaseAmount: number;
  /** Montant total à payer par le client. */
  totalToPay: number;
  isNight: boolean;
  minFareApplied: boolean;
}

export function roundUpToStep(amount: number, step: number): number {
  if (step <= 1) return Math.ceil(amount);
  return Math.ceil(amount / step) * step;
}

export function computeQuote(rule: PricingRuleParams, input: QuoteInput): QuoteResult {
  if (!(input.distanceKm >= 0)) throw new RangeError('La distance doit être positive.');
  const lines: PriceLine[] = [];

  const billableKm = Math.max(0, input.distanceKm - rule.includedKm);
  const rawCourse = rule.baseFare + Math.round(billableKm * rule.pricePerKm);
  const minFareApplied = rawCourse < rule.minFare;
  const course = Math.max(rule.minFare, rawCourse);
  lines.push({
    code: 'COURSE',
    label: minFareApplied ? 'Course (prix minimum)' : `Course (${formatKm(input.distanceKm)})`,
    amount: course,
  });

  if (input.speed === DeliverySpeed.EXPRESS) {
    const express = rule.expressFixed + Math.round((course * rule.expressPercent) / 100);
    if (express > 0) lines.push({ code: 'EXPRESS', label: 'Supplément express', amount: express });
  }

  const isNight =
    !!rule.nightStart && !!rule.nightEnd && isTimeInRange(input.localTime, rule.nightStart, rule.nightEnd);
  if (isNight && rule.nightSurcharge > 0) {
    lines.push({ code: 'NIGHT', label: 'Supplément de nuit', amount: rule.nightSurcharge });
  }

  const extraStops = Math.max(0, Math.floor(input.extraStops ?? 0));
  if (extraStops > 0 && rule.extraStopFee > 0) {
    lines.push({
      code: 'EXTRA_STOPS',
      label: `Arrêt${extraStops > 1 ? 's' : ''} supplémentaire${extraStops > 1 ? 's' : ''} (${extraStops})`,
      amount: extraStops * rule.extraStopFee,
    });
  }

  const purchaseAmount = Math.max(0, Math.round(input.purchaseAmount ?? 0));
  if (purchaseAmount > 0 && (rule.purchaseFeePercent > 0 || rule.purchaseFeeMin > 0)) {
    const fee = Math.max(rule.purchaseFeeMin, Math.round((purchaseAmount * rule.purchaseFeePercent) / 100));
    lines.push({ code: 'PURCHASE_FEE', label: "Frais d'achat", amount: fee });
  }

  const waitingMinutes = Math.ceil(Math.max(0, input.waitingMinutes ?? 0));
  const billableWaiting = Math.max(0, waitingMinutes - rule.waitingFreeMinutes);
  if (billableWaiting > 0 && rule.waitingPricePerMinute > 0) {
    lines.push({
      code: 'WAITING',
      label: `Attente (${billableWaiting} min)`,
      amount: billableWaiting * rule.waitingPricePerMinute,
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const deliveryFee = roundUpToStep(subtotal, rule.roundingStep);
  if (deliveryFee !== subtotal) {
    lines.push({ code: 'ROUNDING', label: 'Arrondi', amount: deliveryFee - subtotal });
  }

  const commissionPercent = input.commissionPercentOverride ?? rule.commissionPercent;
  const commissionAmount = Math.round((deliveryFee * commissionPercent) / 100);

  return {
    distanceKm: input.distanceKm,
    speed: input.speed,
    lines,
    deliveryFee,
    commissionPercent,
    commissionAmount,
    driverEarning: deliveryFee - commissionAmount,
    purchaseAmount,
    totalToPay: deliveryFee + purchaseAmount,
    isNight,
    minFareApplied,
  };
}

function formatKm(km: number): string {
  return `${km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
}

// ---------------------------------------------------------------------------- choix de la règle

export interface SelectableRule {
  id: string;
  zoneId: string | null;
  serviceType: ServiceType | null;
  vehicleType: VehicleType | null;
  priority: number;
  isActive: boolean;
  validFrom: Date;
  validTo: Date | null;
}

export interface RuleCriteria {
  zoneId: string | null;
  serviceType: ServiceType;
  vehicleType: VehicleType;
  at: Date;
}

/**
 * Choisit la règle la plus spécifique applicable (les règles doivent déjà être filtrées sur la ville).
 * Spécificité : zone (4) > type de service (2) > véhicule (1) ; puis priorité, puis la plus récente.
 */
export function selectPricingRule<T extends SelectableRule>(rules: T[], criteria: RuleCriteria): T | null {
  const candidates = rules.filter(
    (r) =>
      r.isActive &&
      r.validFrom <= criteria.at &&
      (r.validTo === null || r.validTo > criteria.at) &&
      (r.zoneId === null || r.zoneId === criteria.zoneId) &&
      (r.serviceType === null || r.serviceType === criteria.serviceType) &&
      (r.vehicleType === null || r.vehicleType === criteria.vehicleType),
  );
  const specificity = (r: SelectableRule) =>
    (r.zoneId ? 4 : 0) + (r.serviceType ? 2 : 0) + (r.vehicleType ? 1 : 0);
  candidates.sort(
    (a, b) =>
      specificity(b) - specificity(a) ||
      b.priority - a.priority ||
      b.validFrom.getTime() - a.validFrom.getTime(),
  );
  return candidates[0] ?? null;
}
