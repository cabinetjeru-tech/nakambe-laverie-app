import { BadRequestException } from '@nestjs/common';
import { DateTime, Interval } from 'luxon';

/**
 * Heures « murales » d'un salon (« 08:00 ») ↔ instants UTC. Tous les calculs d'agenda
 * passent par le fuseau du salon : un salon à Dakar et un autre à Paris partagent le même code.
 */
export function parseLocalDate(date: string, zone: string): DateTime {
  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Date invalide (AAAA-MM-JJ).');
  return day.startOf('day');
}

export function atLocalTime(day: DateTime, hhmm: string): DateTime {
  const [hour, minute] = hhmm.split(':').map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

export function localDayBounds(date: string, zone: string): { start: Date; end: Date } {
  const day = parseLocalDate(date, zone);
  return { start: day.toJSDate(), end: day.plus({ days: 1 }).toJSDate() };
}

export function todayIn(zone: string): string {
  return DateTime.now().setZone(zone).toISODate()!;
}

/** Période [from, to] en jours locaux inclus → bornes UTC [start, end[. */
export function localPeriodBounds(from: string, to: string, zone: string): { start: Date; end: Date } {
  const start = parseLocalDate(from, zone);
  const end = parseLocalDate(to, zone).plus({ days: 1 });
  if (end <= start) throw new BadRequestException('La date de fin précède la date de début.');
  if (end.diff(start, 'days').days > 366) throw new BadRequestException('Période limitée à un an.');
  return { start: start.toJSDate(), end: end.toJSDate() };
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.overlaps(b);
}

/** Soustrait des intervalles occupés d'intervalles libres. */
export function subtractIntervals(free: Interval[], busy: Interval[]): Interval[] {
  let result = free;
  for (const block of busy) {
    result = result.flatMap((slot) => slot.difference(block));
  }
  return result.filter((slot) => slot.isValid && slot.length('minutes') > 0);
}
