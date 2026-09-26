'use client';

import clsx from 'clsx';
import { AlertTriangle, ChevronRight, Clock, Power } from 'lucide-react';
import Link from 'next/link';
import { DriverDocuments } from '@/components/driver-documents';
import { InstallButton, PushToggle } from '@/components/pwa';
import { Alert, Card, Spinner, Stat, StatusBadge } from '@/components/ui';
import { useDriver } from '@/lib/driver-runtime';
import { fcfa, SERVICE_LABELS, STATUS_LABELS } from '@/lib/format';
import { useApi } from '@/lib/use-api';

interface Earnings {
  today: { earnings: number; deliveries: number };
  week: { earnings: number; deliveries: number };
}

export default function DriverHome() {
  const { profile, reloadProfile, online, setOnline, toggling, error, mission, gpsStatus } = useDriver();
  const earnings = useApi<Earnings>(profile?.status === 'APPROVED' ? '/driver/earnings' : null, { refreshInterval: 120_000 });

  if (!profile) return <Spinner />;

  if (profile.status !== 'APPROVED') {
    return (
      <div className="space-y-4">
        <Card className={clsx(profile.status === 'PENDING' ? 'bg-brand-sky' : 'bg-red-50')}>
          <div className="flex gap-3">
            {profile.status === 'PENDING' ? <Clock className="h-6 w-6 shrink-0 text-brand" /> : <AlertTriangle className="h-6 w-6 shrink-0 text-red-600" />}
            <div>
              <p className="font-bold text-brand">
                {profile.status === 'PENDING' ? 'Inscription en cours de validation' : profile.status === 'REJECTED' ? 'Inscription non retenue' : 'Compte suspendu'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {profile.status === 'PENDING'
                  ? 'Envoyez les photos de vos documents ci-dessous. L’équipe Allô-Coursier vous contactera pour finaliser votre inscription.'
                  : profile.rejectionReason ?? 'Contactez l’équipe Allô-Coursier pour plus d’informations.'}
              </p>
            </div>
          </div>
        </Card>
        {profile.status === 'PENDING' && (
          <Card>
            <h2 className="mb-3 font-semibold text-brand">Mes documents</h2>
            <DriverDocuments profile={profile} onChange={reloadProfile} />
          </Card>
        )}
        <Card className="space-y-2">
          <p className="text-sm text-slate-600">Préparez déjà votre téléphone :</p>
          <div className="flex flex-wrap gap-2">
            <PushToggle compact />
            <InstallButton variant="primary" label="Installer l’application livreur" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setOnline(!online)}
        disabled={toggling || (online && !!mission)}
        className={clsx(
          'flex w-full items-center gap-4 rounded-3xl p-5 text-left shadow-card transition active:scale-[0.99] disabled:opacity-70',
          online ? 'bg-brand-green text-white' : 'bg-white text-brand',
        )}
      >
        <span className={clsx('flex h-14 w-14 items-center justify-center rounded-full', online ? 'bg-white/20' : 'bg-brand-sky')}>
          <Power className="h-7 w-7" />
        </span>
        <span>
          <span className="block text-xl font-extrabold">{toggling ? '…' : online ? 'Vous êtes en ligne' : 'Vous êtes hors ligne'}</span>
          <span className={clsx('text-sm', online ? 'text-green-50' : 'text-slate-500')}>
            {online ? (mission ? 'Mission en cours' : 'En attente de missions. Touchez pour vous déconnecter.') : 'Touchez pour recevoir des missions'}
          </span>
        </span>
      </button>
      <Alert>{error}</Alert>
      {online && gpsStatus === 'waiting' && <Alert tone="amber">Recherche du signal GPS…</Alert>}
      {profile.blockedByDebt && (
        <Alert tone="amber">
          Vous détenez {fcfa(profile.cashDebt)} d’espèces (plafond {fcfa(profile.cashDebtLimit)}). Versez-les à l’agence pour recevoir de nouvelles missions.
        </Alert>
      )}

      {mission && (
        <Link href={`/livreur/missions/${mission.id}`} className="flex items-center gap-3 rounded-2xl bg-brand p-4 text-white shadow-card">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs text-blue-200">
              Mission en cours · {mission.reference}
            </span>
            <span className="block font-bold">{SERVICE_LABELS[mission.serviceType]}</span>
            <span className="mt-1 inline-block">
              <StatusBadge status={mission.status} label={STATUS_LABELS[mission.status]} />
            </span>
          </span>
          <ChevronRight className="h-6 w-6" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Aujourd’hui" value={fcfa(earnings.data?.today.earnings)} hint={`${earnings.data?.today.deliveries ?? 0} livraison(s)`} tone="green" />
        <Stat label="Cette semaine" value={fcfa(earnings.data?.week.earnings)} hint={`${earnings.data?.week.deliveries ?? 0} livraison(s)`} />
      </div>
      {profile.employmentType === 'SALARIE' && <p className="text-center text-xs text-slate-500">Livreur salarié : vos livraisons sont comptées, votre rémunération est versée par salaire.</p>}

      <Card className="space-y-2 text-sm text-slate-600">
        <p className="font-semibold text-brand">Conseils</p>
        <p>• Gardez l’application ouverte pendant une mission : votre position est partagée avec le client.</p>
        <p>• Activez les notifications pour être prévenu d’une mission même écran verrouillé.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <PushToggle compact />
        </div>
      </Card>
    </div>
  );
}
