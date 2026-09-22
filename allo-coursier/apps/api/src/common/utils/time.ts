/** Heure locale "HH:mm" d'un instant dans un fuseau donné. */
export function localTimeHHmm(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // Certains moteurs renvoient "24" pour minuit.
  return `${hour === '24' ? '00' : hour}:${minute}`;
}

/** Vrai si l'heure "HH:mm" est dans la plage [start, end[ ; gère les plages qui passent minuit. */
export function isTimeInRange(time: string, start: string, end: string): boolean {
  if (start === end) return false;
  if (start < end) return time >= start && time < end;
  return time >= start || time < end;
}

export const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
