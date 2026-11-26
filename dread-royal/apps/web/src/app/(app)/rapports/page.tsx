'use client';
import { FileSpreadsheet, FileText, Table2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RequirePerm } from '@/components/AppShell';
import { Button, Card, ErrorBox, Input, PageHeader, Select, Spinner, Table, Tabs } from '@/components/ui';
import { api, fileUrl, openFile, qs } from '@/lib/api';
import { fmtDate, fmtDateTime, formatFCFA, todayISO } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function RapportsPage() {
  return <RequirePerm perms={['reports.view']}><Rapports /></RequirePerm>;
}

function cell(v: any, t?: string) {
  if (v === null || v === undefined || v === '') return '';
  if (t === 'money') return formatFCFA(v, false);
  if (t === 'date') return fmtDate(v);
  if (t === 'datetime') return fmtDateTime(v);
  return String(v);
}

function Rapports() {
  const catalog = useApi<any[]>('/reports');
  const [type, setType] = useState('');
  const [mode, setMode] = useState<'period' | 'range'>('period');
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(todayISO());
  const [from, setFrom] = useState(todayISO().slice(0, 8) + '01');
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (catalog.data?.length && !type) setType(catalog.data[0].key); }, [catalog.data, type]);
  const params = mode === 'period' ? { period, date } : { from, to };
  useEffect(() => {
    if (!type) return;
    setLoading(true); setError('');
    api(`/reports/${type}${qs(params)}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [type, mode, period, date, from, to]); // eslint-disable-line
  const exp = async (format: string) => {
    if (format === 'pdf') return openFile(`/reports/${type}${qs({ ...params, format })}`);
    const a = document.createElement('a');
    a.href = await fileUrl(`/reports/${type}${qs({ ...params, format })}`);
    a.download = `${type}.${format}`;
    a.click();
  };
  const def = catalog.data?.find((r) => r.key === type);
  return (
    <>
      <PageHeader title="Rapports & exports" subtitle="Données réelles de la base, exportables en PDF, Excel et CSV" actions={type && <>
        <Button variant="outline" icon={<FileText className="h-4 w-4" />} onClick={() => exp('pdf')}>PDF</Button>
        <Button variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => exp('xlsx')}>Excel</Button>
        <Button variant="outline" icon={<Table2 className="h-4 w-4" />} onClick={() => exp('csv')}>CSV</Button>
      </>} />
      {catalog.data && <Tabs value={type} onChange={setType} tabs={catalog.data.map((r) => ({ key: r.key, label: r.title.replace(/\s*\(.*\)/, '') }))} />}
      {def?.periodic && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select value={mode} onChange={(e) => setMode(e.target.value as any)} className="w-40"><option value="period">Période type</option><option value="range">Dates libres</option></Select>
          {mode === 'period' ? <>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-36"><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="year">Année</option></Select>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          </> : <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /><span>au</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </>}
        </div>
      )}
      {error && <ErrorBox error={error} />}
      {loading && <Spinner />}
      {data && !loading && (
        <Card title={data.title} actions={<span className="text-xs text-neutral-500">{data.subtitle}</span>}>
          {data.summary && <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">{data.summary.map((s: any) => <div key={s.label} className="rounded-lg bg-royal-gold-light/50 p-3"><p className="text-xs text-neutral-600">{s.label}</p><p className="font-bold">{s.value}</p></div>)}</div>}
          <Table rows={data.rows.map((r: any, i: number) => ({ ...r, id: String(i) }))} empty="Aucune donnée sur la période."
            columns={data.columns.map((c: any) => ({ key: c.key, label: c.label, align: c.type === 'money' || c.type === 'int' ? 'right' : 'left', render: (r: any) => cell(r[c.key], c.type) }))}
            footer={data.totals && data.rows.length > 0 && <tr className="bg-royal-gold-light font-bold">{data.columns.map((c: any, i: number) => <td key={c.key} className={`px-3 py-2 ${c.type === 'money' || c.type === 'int' ? 'text-right' : ''}`}>{i === 0 && data.totals[c.key] === undefined ? 'TOTAL' : cell(data.totals[c.key], c.type)}</td>)}</tr>} />
        </Card>
      )}
    </>
  );
}
