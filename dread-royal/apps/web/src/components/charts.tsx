'use client';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatFCFA } from '@dread-royal/shared';

/** Palette validée (CVD, contraste) : série 1 = or, série 2 = bleu. Une seule échelle par graphique. */
export const SERIES = ['#A67C1A', '#3B6FB6'];
const axis = { fontSize: 11, fill: '#6B7280' };
const short = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)} k` : String(n));
const tipStyle = { borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 };

export function MoneyLines({ data, series, xKey = 'key', xFormat }: { data: any[]; series: { key: string; label: string }[]; xKey?: string; xFormat?: (v: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#F0F0F0" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} tickFormatter={xFormat} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis tick={axis} tickFormatter={short} axisLine={false} tickLine={false} width={48} />
        <Tooltip contentStyle={tipStyle} formatter={(v: number, n: string) => [formatFCFA(v), n]} labelFormatter={(l) => (xFormat ? xFormat(l) : l)} cursor={{ stroke: '#9CA3AF', strokeDasharray: '3 3' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CountLines({ data, series, xFormat }: { data: any[]; series: { key: string; label: string }[]; xFormat?: (v: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#F0F0F0" vertical={false} />
        <XAxis dataKey="key" tick={axis} tickFormatter={xFormat} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis tick={axis} allowDecimals={false} axisLine={false} tickLine={false} width={32} />
        <Tooltip contentStyle={tipStyle} labelFormatter={(l) => (xFormat ? xFormat(l) : l)} cursor={{ stroke: '#9CA3AF', strokeDasharray: '3 3' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barres horizontales à série unique (classement). */
export function RankBars({ data, valueKey, labelKey, money, height }: { data: any[]; valueKey: string; labelKey: string; money?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, data.length * 34 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid stroke="#F0F0F0" horizontal={false} />
        <XAxis type="number" tick={axis} tickFormatter={money ? short : undefined} allowDecimals={false} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey={labelKey} tick={{ ...axis, fill: '#374151' }} width={150} axisLine={false} tickLine={false} tickFormatter={(v: string) => (v.length > 24 ? v.slice(0, 23) + '…' : v)} />
        <Tooltip contentStyle={tipStyle} cursor={{ fill: 'rgba(212,175,55,0.08)' }} formatter={(v: number) => [money ? formatFCFA(v) : v, money ? 'Montant' : 'Nombre']} />
        <Bar dataKey={valueKey} fill={SERIES[0]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
