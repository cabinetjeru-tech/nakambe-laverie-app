const moneyFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** 16500 → « 16 500 FCFA » */
export function money(value: number | string | null | undefined, currency = 'XOF'): string {
  const amount = Number(value ?? 0);
  const label = currency === 'XOF' ? 'FCFA' : currency;
  return `${moneyFormatter.format(amount)} ${label}`;
}

export function number(value: number | string | null | undefined, digits = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(Number(value ?? 0));
}

export function time(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso));
}

export function date(iso: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso));
}

export function dateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso));
}

export function longDay(isoDate: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Date du jour (AAAA-MM-JJ) dans un fuseau donné. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Heure locale du salon « 10:00 » un jour donné → instant ISO (décalage du fuseau calculé). */
export function localToIso(isoDate: string, hhmm: string, timeZone: string): string {
  const guess = new Date(`${isoDate}T${hhmm}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString();
}

export const APPOINTMENT_STATUS: Record<string, { label: string; tone: 'gray' | 'blue' | 'violet' | 'amber' | 'green' | 'red' }> = {
  PENDING: { label: 'En attente', tone: 'amber' },
  CONFIRMED: { label: 'Confirmé', tone: 'blue' },
  CHECKED_IN: { label: 'Arrivé', tone: 'violet' },
  IN_PROGRESS: { label: 'En cours', tone: 'violet' },
  COMPLETED: { label: 'Terminé', tone: 'green' },
  CANCELLED_BY_CLIENT: { label: 'Annulé (client)', tone: 'gray' },
  CANCELLED_BY_SALON: { label: 'Annulé (salon)', tone: 'gray' },
  NO_SHOW: { label: 'Absent', tone: 'red' },
};

export const PAYMENT_METHOD: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY_MANUAL: 'Mobile Money',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Carte',
  BANK_TRANSFER: 'Virement',
  CHEQUE: 'Chèque',
  OTHER: 'Autre',
};

/** Minutes écoulées depuis minuit, dans le fuseau du salon. */
export function minutesInZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  return h * 60 + m;
}
