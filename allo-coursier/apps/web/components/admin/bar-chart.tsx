'use client';

import { useState } from 'react';

/**
 * Histogramme à une seule série (une teinte), barres fines à bouts arrondis ancrées sur la ligne de base,
 * écart de 2 px entre barres, info-bulle au survol / toucher, étiquettes d'axe discrètes.
 */
export function BarChart({ data, format, label }: { data: { key: string; label: string; value: number }[]; format: (v: number) => string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const H = 140;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure aria-label={label}>
      <div className="relative">
        <div className="flex h-[140px] items-end gap-[2px] border-b border-slate-200" role="img" aria-label={`${label} : total ${format(total)}`}>
          {data.map((d, i) => {
            const h = d.value > 0 ? Math.max(3, (d.value / max) * (H - 8)) : 0;
            return (
              <div
                key={d.key}
                className="flex h-full flex-1 cursor-default items-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(i)}
              >
                <div className="w-full rounded-t-[4px] transition-colors" style={{ height: h, background: hover === i ? '#0B2A5B' : '#2F80ED' }} />
              </div>
            );
          })}
        </div>
        {hover != null && data[hover] && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <span className="block text-slate-300">{data[hover].label}</span>
            <span className="font-semibold tabular-nums">{format(data[hover].value)}</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer">Voir les valeurs</summary>
        <table className="mt-1 w-full">
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-t border-slate-100">
                <td className="py-0.5">{d.label}</td>
                <td className="py-0.5 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
