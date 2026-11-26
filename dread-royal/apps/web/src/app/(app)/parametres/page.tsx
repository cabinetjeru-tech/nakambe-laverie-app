'use client';
import { DatabaseBackup, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PAYMENT_METHOD_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { Button, Card, Field, Input, MoneyInput, PageHeader, Spinner, Table, Tabs, Textarea, useUi } from '@/components/ui';
import { fileUrl, post, put } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function ParametresPage() {
  return <RequirePerm perms={['settings.manage', 'backup.manage']}><Parametres /></RequirePerm>;
}

function Parametres() {
  const { can } = useAuth();
  const { toast } = useUi();
  const [tab, setTab] = useState<'salon' | 'fidelite' | 'tresorerie' | 'sauvegardes'>(can('settings.manage') ? 'salon' : 'sauvegardes');
  const settings = useApi<any>('/settings');
  const backupInfo = useApi<any>(can('backup.manage') ? '/backups/info' : null);
  const { confirm } = useUi();
  const restore = async (file: string) => {
    const r = await confirm({ title: 'Restaurer cette sauvegarde ?', danger: true, confirmLabel: 'Restaurer', message: <>Toutes les données actuelles seront <b>remplacées</b> par celles du {file}. L&apos;état actuel est d&apos;abord sauvegardé automatiquement. Vous devrez vous reconnecter.</>, reasonLabel: 'Tapez RESTAURER pour confirmer', reasonRequired: true });
    if (!r.ok) return;
    if (r.reason !== 'RESTAURER') { toast('error', 'Confirmation incorrecte : tapez RESTAURER'); return; }
    setBusy(true);
    try { await post(`/backups/${file}/restore`, { confirm: 'RESTAURER' }); toast('success', 'Sauvegarde restaurée. Reconnectez-vous.'); setTimeout(() => { localStorage.removeItem('dr.access'); localStorage.removeItem('dr.refresh'); location.href = '/login/'; }, 1500); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings.data) setF(structuredClone(settings.data)); }, [settings.data]);
  const save = async (key: string) => {
    setBusy(true);
    try { await put(`/settings/${key}`, f[key]); toast('success', 'Paramètres enregistrés'); settings.reload(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  const set = (key: string, k: string, v: any) => setF({ ...f, [key]: { ...f[key], [k]: v } });
  if (!f) return <Spinner />;
  return (
    <>
      <PageHeader title="Paramètres" />
      <Tabs value={tab} onChange={setTab} tabs={[...(can('settings.manage') ? [{ key: 'salon' as const, label: 'Salon & documents' }, { key: 'fidelite' as const, label: 'Fidélité' }, { key: 'tresorerie' as const, label: 'Trésorerie' }] : []), ...(can('backup.manage') ? [{ key: 'sauvegardes' as const, label: 'Sauvegardes' }] : [])]} />
      {tab === 'salon' && (
        <Card title="Informations figurant sur les factures et documents" actions={<Button loading={busy} onClick={() => save('salon')}>Enregistrer</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[['name', 'Nom commercial'], ['subtitle', 'Sous-titre'], ['slogan', 'Slogan'], ['address', 'Adresse'], ['phone', 'Téléphone'], ['email', 'E-mail'], ['ifu', 'N° IFU (DGI)'], ['rccm', 'N° RCCM'], ['taxRegime', 'Régime fiscal (ex : CME, RSI)']].map(([k, l]) => <Field key={k} label={l}><Input value={f.salon[k] ?? ''} onChange={(e) => set('salon', k, e.target.value)} /></Field>)}
            <Field label="Pied de facture" className="sm:col-span-2"><Textarea value={f.salon.invoiceFooter ?? ''} onChange={(e) => set('salon', 'invoiceFooter', e.target.value)} /></Field>
          </div>
        </Card>
      )}
      {tab === 'fidelite' && (
        <Card title="Règles du programme de fidélité" actions={<Button loading={busy} onClick={() => save('loyalty')}>Enregistrer</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={!!f.loyalty.enabled} onChange={(e) => set('loyalty', 'enabled', e.target.checked)} />Programme de fidélité actif</label>
            <Field label="Montant payé pour 1 point"><MoneyInput value={f.loyalty.amountPerPoint} onChange={(v) => set('loyalty', 'amountPerPoint', Number(v) || 1)} /></Field>
            <Field label="Valeur d'un point en réduction"><MoneyInput value={f.loyalty.pointValue} onChange={(v) => set('loyalty', 'pointValue', Number(v) || 0)} /></Field>
            <Field label="Minimum de points pour une récompense"><Input type="number" min={0} value={f.loyalty.minRedeemPoints} onChange={(e) => set('loyalty', 'minRedeemPoints', Number(e.target.value))} /></Field>
            <Field label="Part maximale d'une vente payable en points (%)"><Input type="number" min={0} max={100} value={f.loyalty.maxRedeemPercent} onChange={(e) => set('loyalty', 'maxRedeemPercent', Number(e.target.value))} /></Field>
          </div>
          <p className="mt-3 text-xs text-neutral-500">Exemple actuel : 25 000 FCFA payés = {Math.floor(25000 / (f.loyalty.amountPerPoint || 1))} points = {Math.floor(25000 / (f.loyalty.amountPerPoint || 1)) * f.loyalty.pointValue} FCFA de réduction future.</p>
        </Card>
      )}
      {tab === 'tresorerie' && (
        <Card title="Soldes d'ouverture de la trésorerie" actions={<Button loading={busy} onClick={() => save('treasury')}>Enregistrer</Button>}>
          <p className="mb-3 text-sm text-neutral-600">Indiquez les montants disponibles à la date de démarrage de l&apos;application (espèces, comptes Orange Money / Moov Money, banque).</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date de démarrage"><Input type="date" value={f.treasury.openingDate ?? ''} onChange={(e) => set('treasury', 'openingDate', e.target.value || null)} /></Field>
            {Object.keys(PAYMENT_METHOD_LABELS).map((m) => <Field key={m} label={PAYMENT_METHOD_LABELS[m]}><MoneyInput value={f.treasury.openingBalances[m] ?? 0} onChange={(v) => set('treasury', 'openingBalances', { ...f.treasury.openingBalances, [m]: Number(v) || 0 })} /></Field>)}
          </div>
        </Card>
      )}
      {tab === 'sauvegardes' && (
        <Card title="Sauvegardes de la base de données" actions={<Button icon={<DatabaseBackup className="h-4 w-4" />} loading={busy} onClick={async () => { setBusy(true); try { await post('/backups'); toast('success', 'Sauvegarde créée'); backupInfo.reload(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); } }}>Sauvegarder maintenant</Button>}>
          {backupInfo.data?.uiRestore ? (
            <p className="mb-3 text-sm text-neutral-600">Des sauvegardes automatiques sont faites chaque jour à 13 h et 19 h. Dossier sur cet ordinateur : <code className="rounded bg-neutral-100 px-1 text-xs">{backupInfo.data.dir}</code> (menu Fichier → « Ouvrir le dossier des sauvegardes »). <b>Copiez-les chaque semaine sur une clé USB</b> : en cas de panne de l&apos;ordinateur, c&apos;est votre seule copie. Pour reprendre une sauvegarde venant d&apos;un autre ordinateur, copiez le fichier dans ce dossier puis cliquez sur « Restaurer ».</p>
          ) : (
            <p className="mb-3 text-sm text-neutral-600">Une sauvegarde automatique est réalisée chaque nuit. Téléchargez régulièrement une copie hors du serveur (clé USB, cloud). La restauration se fait par l&apos;administrateur technique avec <code>deploy/restore.sh</code>.</p>
          )}
          {backupInfo.data && <Table rows={backupInfo.data.items.map((b: any) => ({ ...b, id: b.file }))} empty="Aucune sauvegarde." columns={[
            { key: 'file', label: 'Fichier', render: (b: any) => <span className="font-mono text-xs">{b.file}</span> },
            { key: 'createdAt', label: 'Date', render: (b: any) => fmtDateTime(b.createdAt) },
            { key: 'size', label: 'Taille', align: 'right', render: (b: any) => `${(b.size / 1024).toFixed(0)} Ko` },
            { key: 'd', label: '', render: (b: any) => <div className="flex gap-1"><Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={async () => { const a = document.createElement('a'); a.href = await fileUrl(`/backups/${b.file}`); a.click(); }}>Télécharger</Button>{backupInfo.data?.uiRestore && b.file.endsWith('.json.gz') && <Button size="sm" variant="outline" onClick={() => restore(b.file)}>Restaurer</Button>}</div> },
          ]} />}
        </Card>
      )}
    </>
  );
}
