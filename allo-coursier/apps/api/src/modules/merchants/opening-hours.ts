import { HHMM_REGEX, localTimeHHmm } from '../../common/utils/time';

export interface OpeningSlot {
  weekday: number; // 0 = dimanche … 6 = samedi
  opensAt: string; // "08:00"
  closesAt: string; // "22:00" ; si < opensAt, le créneau se termine le lendemain
}

export interface OpeningInput {
  status: string;
  isOpenOverride: boolean | null;
  hours: OpeningSlot[];
  closures: { startsAt: Date; endsAt: Date }[];
}

/** Jour de la semaine local (0 = dimanche) d'un instant dans un fuseau donné. */
export function localWeekday(at: Date, timeZone: string): number {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day);
}

/**
 * Le commerce accepte-t-il des commandes à cet instant ?
 * Ordre : statut actif, forçage manuel, fermeture exceptionnelle, puis horaires.
 * Un commerce sans aucun horaire saisi est considéré ouvert en permanence.
 */
export function isOpenAt(input: OpeningInput, at: Date, timeZone: string): boolean {
  if (input.status !== 'ACTIVE') return false;
  if (input.isOpenOverride !== null) return input.isOpenOverride;
  if (input.closures.some((c) => c.startsAt <= at && at < c.endsAt)) return false;
  if (input.hours.length === 0) return true;
  const time = localTimeHHmm(at, timeZone);
  const day = localWeekday(at, timeZone);
  const yesterday = (day + 6) % 7;
  return input.hours.some((slot) => {
    const overnight = slot.closesAt <= slot.opensAt;
    if (slot.weekday === day) return overnight ? time >= slot.opensAt : time >= slot.opensAt && time < slot.closesAt;
    if (slot.weekday === yesterday && overnight) return time < slot.closesAt;
    return false;
  });
}

export function hoursValidationError(hours: OpeningSlot[]): string | null {
  for (const h of hours) {
    if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6) return 'Jour invalide.';
    if (!HHMM_REGEX.test(h.opensAt) || !HHMM_REGEX.test(h.closesAt)) return 'Heures attendues au format HH:mm.';
    if (h.opensAt === h.closesAt) return 'Un créneau doit avoir une heure de fermeture différente de l’ouverture.';
  }
  return null;
}
