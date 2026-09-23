import { hoursValidationError, isOpenAt, localWeekday, OpeningInput } from './opening-hours';

const TZ = 'Africa/Ouagadougou'; // UTC+0
// 2026-09-23 est un mercredi (3)
const at = (iso: string) => new Date(`2026-09-23T${iso}:00Z`);
const base: OpeningInput = {
  status: 'ACTIVE',
  isOpenOverride: null,
  hours: [
    { weekday: 3, opensAt: '08:00', closesAt: '14:00' },
    { weekday: 3, opensAt: '18:00', closesAt: '02:00' }, // soirée jusqu'au lendemain
  ],
  closures: [],
};

describe('horaires des commerces', () => {
  it('calcule le jour local', () => {
    expect(localWeekday(at('12:00'), TZ)).toBe(3);
  });

  it('respecte les créneaux du jour', () => {
    expect(isOpenAt(base, at('07:59'), TZ)).toBe(false);
    expect(isOpenAt(base, at('08:00'), TZ)).toBe(true);
    expect(isOpenAt(base, at('15:00'), TZ)).toBe(false);
    expect(isOpenAt(base, at('23:30'), TZ)).toBe(true);
  });

  it('gère un créneau qui passe minuit', () => {
    expect(isOpenAt(base, new Date('2026-09-24T01:30:00Z'), TZ)).toBe(true);
    expect(isOpenAt(base, new Date('2026-09-24T02:00:00Z'), TZ)).toBe(false);
  });

  it('applique le forçage manuel, les fermetures et le statut', () => {
    expect(isOpenAt({ ...base, isOpenOverride: false }, at('10:00'), TZ)).toBe(false);
    expect(isOpenAt({ ...base, isOpenOverride: true }, at('16:00'), TZ)).toBe(true);
    expect(isOpenAt({ ...base, closures: [{ startsAt: at('09:00'), endsAt: at('11:00') }] }, at('10:00'), TZ)).toBe(false);
    expect(isOpenAt({ ...base, status: 'SUSPENDED', isOpenOverride: true }, at('10:00'), TZ)).toBe(false);
  });

  it('considère ouvert un commerce sans horaires', () => {
    expect(isOpenAt({ ...base, hours: [] }, at('04:00'), TZ)).toBe(true);
  });

  it('valide les créneaux', () => {
    expect(hoursValidationError(base.hours)).toBeNull();
    expect(hoursValidationError([{ weekday: 7, opensAt: '08:00', closesAt: '10:00' }])).not.toBeNull();
    expect(hoursValidationError([{ weekday: 1, opensAt: '8h', closesAt: '10:00' }])).not.toBeNull();
    expect(hoursValidationError([{ weekday: 1, opensAt: '10:00', closesAt: '10:00' }])).not.toBeNull();
  });
});
