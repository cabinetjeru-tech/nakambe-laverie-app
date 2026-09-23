import { Injectable } from '@nestjs/common';
import { DateTime, Interval } from 'luxon';
import { DbService } from '../../core/db/db.service';
import { atLocalTime, subtractIntervals } from '../../core/time/zoned';

export interface SalonForAgenda {
  id: string;
  timezone: string;
  slotIntervalMinutes: number;
}

/**
 * Calcul des disponibilités : horaires du salon ∩ planning de l'employé
 * − fermetures − absences − occupations déjà réservées.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly db: DbService) {}

  /** Plages d'ouverture du salon pour un jour local, fermetures exceptionnelles déduites. */
  async salonWindows(salon: SalonForAgenda, day: DateTime): Promise<Interval[]> {
    const hours = await this.db.tx.salonOpeningHour.findMany({ where: { salonId: salon.id, weekday: day.weekday } });
    const windows = hours.map((h) => Interval.fromDateTimes(atLocalTime(day, h.opensAt), atLocalTime(day, h.closesAt)));
    const closures = await this.db.tx.salonClosure.findMany({
      where: { salonId: salon.id, startsAt: { lt: day.plus({ days: 1 }).toJSDate() }, endsAt: { gt: day.toJSDate() } },
    });
    return subtractIntervals(
      windows,
      closures.map((c) => Interval.fromDateTimes(DateTime.fromJSDate(c.startsAt), DateTime.fromJSDate(c.endsAt))),
    );
  }

  /** Heures de travail d'un employé ce jour-là (planning ∩ ouverture − absences). */
  async staffWorkingWindows(staffId: string, salon: SalonForAgenda, day: DateTime, salonWindows?: Interval[]): Promise<Interval[]> {
    const opening = salonWindows ?? (await this.salonWindows(salon, day));
    const date = day.toJSDate();
    const schedule = await this.db.tx.staffSchedule.findMany({
      where: {
        staffId,
        salonId: salon.id,
        weekday: day.weekday,
        validFrom: { lte: date },
        OR: [{ validTo: null }, { validTo: { gte: date } }],
      },
    });
    const planned = schedule.map((s) => Interval.fromDateTimes(atLocalTime(day, s.startsAt), atLocalTime(day, s.endsAt)));
    const working = planned.flatMap((p) => opening.map((o) => p.intersection(o)).filter((i): i is Interval => i !== null && i.isValid));
    const timeOff = await this.db.tx.staffTimeOff.findMany({
      where: { staffId, startsAt: { lt: day.plus({ days: 1 }).toJSDate() }, endsAt: { gt: date } },
    });
    return subtractIntervals(
      working,
      timeOff.map((t) => Interval.fromDateTimes(DateTime.fromJSDate(t.startsAt), DateTime.fromJSDate(t.endsAt))),
    );
  }

  /** Occupations actives de l'employé (tous salons confondus) sur une période. */
  async busyIntervals(staffId: string, start: Date, end: Date, excludeAppointmentId?: string): Promise<Interval[]> {
    const busy = await this.db.tx.staffBusySlot.findMany({
      where: {
        staffId,
        isActive: true,
        startsAt: { lt: end },
        endsAt: { gt: start },
        ...(excludeAppointmentId ? { NOT: { item: { appointmentId: excludeAppointmentId } } } : {}),
      },
      select: { startsAt: true, endsAt: true },
    });
    return busy.map((b) => Interval.fromDateTimes(DateTime.fromJSDate(b.startsAt), DateTime.fromJSDate(b.endsAt)));
  }

  /**
   * Créneaux de début possibles pour un employé : chaque étape bloquante doit tenir dans
   * ses heures libres, et toute la prestation (temps de pose compris) dans l'ouverture du salon.
   */
  async freeStarts(params: {
    staffId: string;
    salon: SalonForAgenda;
    day: DateTime;
    durationMinutes: number;
    blocking: { offsetMinutes: number; durationMinutes: number }[];
    notBefore: DateTime;
  }): Promise<DateTime[]> {
    const { staffId, salon, day, durationMinutes, blocking, notBefore } = params;
    const opening = await this.salonWindows(salon, day);
    if (opening.length === 0) return [];
    const working = await this.staffWorkingWindows(staffId, salon, day, opening);
    const busy = await this.busyIntervals(staffId, day.toJSDate(), day.plus({ days: 1 }).toJSDate());
    const free = subtractIntervals(working, busy);

    const starts: DateTime[] = [];
    for (const window of opening) {
      let t = window.start!;
      while (t.plus({ minutes: durationMinutes }) <= window.end!) {
        if (t >= notBefore && this.fits(t, durationMinutes, blocking, opening, free)) starts.push(t);
        t = t.plus({ minutes: salon.slotIntervalMinutes });
      }
    }
    return starts;
  }

  fits(
    start: DateTime,
    durationMinutes: number,
    blocking: { offsetMinutes: number; durationMinutes: number }[],
    opening: Interval[],
    free: Interval[],
  ): boolean {
    const whole = Interval.after(start, { minutes: durationMinutes });
    if (!opening.some((o) => o.engulfs(whole))) return false;
    return blocking.every((range) => {
      const needed = Interval.after(start.plus({ minutes: range.offsetMinutes }), { minutes: range.durationMinutes });
      return free.some((f) => f.engulfs(needed));
    });
  }
}
