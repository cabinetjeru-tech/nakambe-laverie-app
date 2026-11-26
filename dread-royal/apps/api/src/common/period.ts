import { BadRequestException } from '@nestjs/common';

/** Burkina Faso = UTC+0 toute l'année : les journées commerciales sont des journées UTC. */
export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
export function parseDate(s: string | undefined, field = 'date'): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s.length === 10 ? `${s}T00:00:00.000Z` : s);
  if (isNaN(d.getTime())) throw new BadRequestException(`Date invalide : ${field}`);
  return d;
}

export type PeriodKind = 'day' | 'week' | 'month' | 'year';

export interface Period {
  from: Date; // inclus
  to: Date; // exclu
  label: string;
}

/** Calcule une période à partir de (from,to) explicites ou d'un type + date de référence. */
export function resolvePeriod(q: { period?: string; date?: string; from?: string; to?: string }): Period {
  if (q.from || q.to) {
    const from = startOfDay(parseDate(q.from, 'from') ?? new Date('2000-01-01'));
    const to = addDays(startOfDay(parseDate(q.to, 'to') ?? new Date()), 1);
    if (to <= from) throw new BadRequestException('Période invalide');
    return { from, to, label: `du ${fmt(from)} au ${fmt(addDays(to, -1))}` };
  }
  const ref = startOfDay(parseDate(q.date) ?? new Date());
  const kind = (q.period ?? 'day') as PeriodKind;
  switch (kind) {
    case 'day':
      return { from: ref, to: addDays(ref, 1), label: `journée du ${fmt(ref)}` };
    case 'week': {
      const dow = (ref.getUTCDay() + 6) % 7; // lundi = 0
      const from = addDays(ref, -dow);
      return { from, to: addDays(from, 7), label: `semaine du ${fmt(from)}` };
    }
    case 'month': {
      const from = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
      const to = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1));
      return { from, to, label: from.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
    }
    case 'year': {
      const from = new Date(Date.UTC(ref.getUTCFullYear(), 0, 1));
      return { from, to: new Date(Date.UTC(ref.getUTCFullYear() + 1, 0, 1)), label: `année ${ref.getUTCFullYear()}` };
    }
    default:
      throw new BadRequestException('Période inconnue (day, week, month, year)');
  }
}

export function fmt(d: Date): string {
  return d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}
export function fmtDateTime(d: Date): string {
  return d.toLocaleString('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
}
