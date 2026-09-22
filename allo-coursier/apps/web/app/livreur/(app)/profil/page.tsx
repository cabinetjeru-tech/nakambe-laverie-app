'use client';

import { LogOut, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ChangeSecretCard } from '@/components/account';
import { DriverDocuments } from '@/components/driver-documents';
import { InstallButton, PushToggle } from '@/components/pwa';
import { Button, Card, PageHeader, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useDriver } from '@/lib/driver-runtime';
import { phoneDisplay, VEHICLE_LABELS } from '@/lib/format';

export default function DriverProfilePage() {
  const { user, logout } = useAuth();
  const { profile, reloadProfile, online, setOnline } = useDriver();
  const router = useRouter();
  if (!profile || !user) return <Spinner />;
  return (
    <div className="space-y-4">
      <PageHeader title={`${user.firstName} ${user.lastName}`} subtitle={phoneDisplay(user.phone)} />
      <Card className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Ville</p>
          <p className="font-semibold">{profile.city.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Statut</p>
          <p className="font-semibold">{profile.employmentType === 'SALARIE' ? 'Salarié' : 'Indépendant'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Véhicule</p>
          <p className="font-semibold">
            {VEHICLE_LABELS[profile.vehicleType]} {profile.plateNumber && `· ${profile.plateNumber}`}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Note</p>
          <p className="flex items-center gap-1 font-semibold">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {profile.ratingCount ? profile.ratingAvg.toFixed(1) : '—'} ({profile.ratingCount})
          </p>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold text-brand">Mes documents</h2>
        <DriverDocuments profile={profile} onChange={reloadProfile} />
      </Card>
      <ChangeSecretCard />
      <Card className="space-y-3">
        <h2 className="font-semibold text-brand">Application</h2>
        <PushToggle />
        <InstallButton variant="primary" label="Installer l’application livreur" />
      </Card>
      <Button
        variant="outline"
        block
        onClick={async () => {
          if (online) await setOnline(false);
          await logout();
          router.replace('/connexion?next=/livreur');
        }}
      >
        <LogOut className="h-4 w-4" /> Se déconnecter
      </Button>
    </div>
  );
}
