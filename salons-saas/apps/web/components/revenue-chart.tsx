'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '@/lib/format';

/**
 * Chiffre d'affaires par jour : une seule série → colonnes d'une seule teinte (emplacement 1
 * de la palette validée), pas de légende (le titre nomme la série), infobulle au survol et
 * vue tableau pour l'accessibilité.
 */
const SERIES = '#2a78d6';
const HEIGHT = 180;
const MAX_BAR = 24;

function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4)! * magnitude;
  return Math.ceil(value / step) * step;
}

function shortDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/** Colonne à extrémité arrondie (4 px), base carrée posée sur la ligne de base. */
function columnPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height);
  const bottom = y + height;
  return `M${x},${bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${bottom} Z`;
}

export function RevenueChart({ from, to, series }: { from: string; to: string; series: { date: string; amount: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(640);

  // Le graphique occupe toute la largeur disponible (et suit les redimensionnements).
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [asTable]);

  // Tous les jours de la période, y compris ceux sans vente (valeur 0).
  const days = useMemo(() => {
    const byDate = new Map(series.map((p) => [p.date, p.amount]));
    const result: { date: string; amount: number }[] = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end && result.length < 400) {
      const iso = cursor.toISOString().slice(0, 10);
      result.push({ date: iso, amount: byDate.get(iso) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }, [from, to, series]);

  const max = niceMax(Math.max(...days.map((d) => d.amount), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const left = 56;
  // Au moins 6 px par jour : au-delà, défilement horizontal plutôt que des colonnes illisibles.
  const width = Math.max(available, left + days.length * 6);
  const slot = (width - left) / Math.max(1, days.length);
  const bar = Math.max(2, Math.min(MAX_BAR, slot - 2));
  // Un libellé de date tous les N jours, pour qu'ils ne se chevauchent jamais (~56 px chacun).
  const labelEvery = Math.max(1, Math.ceil(56 / slot));
  const hovered = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button onClick={() => setAsTable(!asTable)} className="text-xs text-brand-700 hover:underline">
          {asTable ? 'Voir le graphique' : 'Voir le tableau'}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-stone-500">
                <th className="py-1">Jour</th>
                <th className="py-1 text-right">Chiffre d’affaires</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-stone-100">
                  <td className="py-1">{shortDay(d.date)}</td>
                  <td className="py-1 text-right tabular-nums">{money(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={container} className="relative overflow-x-auto">
          <svg width={width} height={HEIGHT + 28} role="img" aria-label={`Chiffre d’affaires par jour du ${shortDay(from)} au ${shortDay(to)}`}>
            {ticks.map((t) => {
              const y = HEIGHT - (t / max) * HEIGHT + 4;
              return (
                <g key={t}>
                  <line x1={left} x2={width} y1={y} y2={y} stroke="#e7e5e4" strokeWidth={1} />
                  <text x={left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#78716c">
                    {new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(t)}
                  </text>
                </g>
              );
            })}
            {days.map((d, i) => {
              const h = (d.amount / max) * HEIGHT;
              const x = left + i * slot + (slot - bar) / 2;
              return (
                <g key={d.date}>
                  {h > 0 && <path d={columnPath(x, HEIGHT - h + 4, bar, h)} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.45} />}
                  {/* Zone de survol plus large que la colonne. */}
                  <rect x={left + i * slot} y={0} width={slot} height={HEIGHT + 4} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                  {i % labelEvery === 0 && (
                    <text x={left + i * slot + slot / 2} y={HEIGHT + 22} textAnchor="middle" fontSize={11} fill="#78716c">
                      {shortDay(d.date)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs shadow"
              style={{ left: Math.min(left + hover * slot, width - 140) }}
            >
              <p className="text-stone-500">{shortDay(hovered.date)}</p>
              <p className="font-semibold tabular-nums text-stone-900">{money(hovered.amount)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
