'use client';

import { useEffect, useState } from 'react';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushSubscriptionStatus,
  isPushSupported,
} from '@/lib/push';

type Status = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';

export function PushNotificationCard() {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!isPushSupported()) {
        setStatus('unsupported');
        return;
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setStatus('denied');
        return;
      }
      try {
        const { subscribed } = await getPushSubscriptionStatus();
        setStatus(subscribed ? 'on' : 'off');
      } catch {
        setStatus('off');
      }
    })();
  }, []);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      const result = await enablePushNotifications();
      if (result.ok) {
        setStatus('on');
      } else if (result.reason === 'denied') {
        setStatus('denied');
      } else {
        setError("Impossible d'activer les notifications pour le moment. Réessayez plus tard.");
      }
    } catch {
      setError("Impossible d'activer les notifications pour le moment. Réessayez plus tard.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await disablePushNotifications();
      setStatus('off');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking' || status === 'unsupported') return null;

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-gold bg-brand-gold-light">
      <div>
        <div className="font-semibold text-brand-blue-dark">🔔 Notifications sonores</div>
        <p className="text-xs text-slate-600">
          {status === 'on' && 'Activées sur cet appareil : vous serez alerté(e) pour chaque nouvelle demande ou réclamation, même app fermée.'}
          {status === 'off' && 'Recevez un son et une alerte dès qu\'un client passe une demande ou une réclamation — même téléphone verrouillé.'}
          {status === 'denied' && 'Bloquées dans les réglages de votre navigateur/téléphone. Autorisez les notifications pour ce site pour les recevoir.'}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      {status === 'off' && (
        <button onClick={handleEnable} disabled={busy} className="btn-primary shrink-0 !py-2 text-sm disabled:opacity-60">
          {busy ? 'Activation...' : 'Activer'}
        </button>
      )}
      {status === 'on' && (
        <button onClick={handleDisable} disabled={busy} className="btn-secondary shrink-0 !py-2 text-sm disabled:opacity-60">
          {busy ? '...' : 'Désactiver'}
        </button>
      )}
    </div>
  );
}
