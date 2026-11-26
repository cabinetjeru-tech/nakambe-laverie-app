export { formatFCFA } from '@dread-royal/shared';

export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '—');
export const fmtDateTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) : '—');
export const fmtTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '');
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const fmtDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}` : `${min} min`);
export const fullName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : '');
export function fmtPhone(p?: string | null) {
  if (!p) return '';
  return p.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}
