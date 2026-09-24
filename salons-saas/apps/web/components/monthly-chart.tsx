'use client';

import { useEffect, useRef, useState } from 'react';
import { shortMonth } from '@/lib/billing';
import { money, number } from '@/lib/format';

/**
 * Série mensuelle (12 mois) : une seule série → colonnes d'une seule teinte, pas de légende
 * (le titre de la carte nomme la série), infobulle au survol, vue tableau accessible.
 * Même grammaire que le graphique du chiffre d'affaires du salon.
 */
const SERIES = '#2a78d6';
const HEIGHT = 160;

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4)! * magnitude;
  return Math.ceil(value / step) * step;
}

function columnPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height);
  const bottom = y + height;
  return `M${x},${bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${bottom} Z`;
}

export function MonthlyChart({ series, kind, label }: { series: { month: string; value: number }[]; kind: 'money' | 'count'; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(560);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [asTable]);

  const format = (v: number) => (kind === 'money' ? money(v) : number(v));
  const max = niceMax(Math.max(...series.map((d) => d.value), 0));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const left = 48;
  const width = Math.max(available, left + series.length * 28);
  const slot = (width - left) / Math.max(1, series.length);
  const bar = Math.max(4, Math.min(32, slot - 8));
  const labelEvery = Math.max(1, Math.ceil(48 / slot));
  const hovered = hover !== null ? series[hover] : null;

  return (
    <div>
      <div className="mb-1 flex justify-end">
        <button onClick={() => setAsTable(!asTable)} className="text-xs text-brand-700 hover:underline">
          {asTable ? 'Voir le graphique' : 'Voir le tableau'}
        </button>
      </div>
      {asTable ? (
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-stone-500">
              <th className="py-1">Mois</th>
              <th className="py-1 text-right">{label}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((d) => (
              <tr key={d.month} className="border-t border-stone-100">
                <td className="py-1">{shortMonth(d.month)}</td>
                <td className="py-1 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={container} className="relative overflow-x-auto">
          <svg width={width} height={HEIGHT + 28} role="img" aria-label={`${label}, 12 derniers mois`}>
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
            {series.map((d, i) => {
              const h = (d.value / max) * HEIGHT;
              const x = left + i * slot + (slot - bar) / 2;
              return (
                <g key={d.month}>
                  {h > 0 && <path d={columnPath(x, HEIGHT - h + 4, bar, h)} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.45} />}
                  <rect x={left + i * slot} y={0} width={slot} height={HEIGHT + 4} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                  {i % labelEvery === 0 && (
                    <text x={left + i * slot + slot / 2} y={HEIGHT + 22} textAnchor="middle" fontSize={11} fill="#78716c">
                      {shortMonth(d.month)}
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
              <p className="text-stone-500">{shortMonth(hovered.month)}</p>
              <p className="font-semibold tabular-nums text-stone-900">{format(hovered.value)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
