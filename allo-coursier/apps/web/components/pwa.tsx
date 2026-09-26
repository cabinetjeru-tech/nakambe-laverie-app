'use client';

import { Bell, BellOff, Download, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }
  }, []);
  return null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l());
  });
}

/** Bouton « Installer l'application » (Android/Chrome) ; explications pour iPhone. */
export function InstallButton({ label = 'Installer l’application', variant = 'success' as const, className }: { label?: string; variant?: 'success' | 'primary' | 'secondary'; className?: string }) {
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setAvailable(!!deferred);
    const update = () => setAvailable(!!deferred);
    installListeners.add(update);
    return () => {
      installListeners.delete(update);
    };
  }, []);

  if (installed) return null;
  if (!available && !ios) return null;
  return (
    <div className={className}>
      <Button
        variant={variant}
        onClick={async () => {
          if (ios) return setShowIosHelp((v) => !v);
          await deferred?.prompt();
          const choice = await deferred?.userChoice;
          if (choice?.outcome === 'accepted') setInstalled(true);
          deferred = null;
          setAvailable(false);
        }}
      >
        <Download className="h-4 w-4" /> {label}
      </Button>
      {showIosHelp && <p className="mt-2 text-sm">Sur iPhone : touchez « Partager » puis « Sur l’écran d’accueil ».</p>}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Active les notifications push (le livreur reçoit ses missions même application fermée). */
export function PushToggle({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'denied' | 'unavailable'>('off');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    });
  }, []);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const { publicKey } = await api<{ publicKey: string | null }>('/push/public-key', { auth: false });
      if (!publicKey) return setState('unavailable');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return setState('denied');
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const json = sub.toJSON();
      await api('/push/subscribe', { body: { endpoint: json.endpoint, keys: json.keys } });
      setState('on');
    } catch (err) {
      setError((err as Error).message || 'Activation impossible sur ce téléphone.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api('/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'unsupported') return compact ? null : <p className="text-sm text-slate-500">Les notifications ne sont pas prises en charge par ce navigateur.</p>;
  if (state === 'unavailable') return <p className="text-sm text-slate-500">Notifications push non configurées sur le serveur.</p>;
  if (state === 'denied') return <p className="text-sm text-amber-700">Notifications bloquées : autorisez-les dans les réglages du navigateur.</p>;
  return (
    <div>
      {state === 'on' ? (
        <Button variant="outline" size={compact ? 'sm' : 'md'} onClick={disable} loading={busy}>
          <BellOff className="h-4 w-4" /> Désactiver les notifications
        </Button>
      ) : (
        <Button variant="secondary" size={compact ? 'sm' : 'md'} onClick={enable} loading={busy}>
          <Bell className="h-4 w-4" /> Activer les notifications
        </Button>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="sticky top-0 z-[900] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white">
      <WifiOff className="h-3.5 w-3.5" /> Pas de connexion — les dernières informations restent affichées
    </div>
  );
}
