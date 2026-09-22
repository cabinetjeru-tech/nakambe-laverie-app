import { api } from './api';

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

export async function getPushSubscriptionStatus(): Promise<{ subscribed: boolean }> {
  const { data } = await api.get('/push/status');
  return data;
}

/** Demande la permission puis abonne cet appareil aux notifications push. */
export async function enablePushNotifications(): Promise<{ ok: boolean; reason?: string; detail?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  let publicKey: string | undefined;
  try {
    const { data } = await api.get('/push/vapid-public-key');
    publicKey = data?.publicKey;
  } catch (err: any) {
    return { ok: false, reason: 'server-unreachable', detail: err?.message };
  }
  if (!publicKey) return { ok: false, reason: 'server-not-configured' };

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    } catch (err: any) {
      return { ok: false, reason: 'subscribe-failed', detail: err?.message };
    }
  }

  const json = subscription.toJSON();
  try {
    await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  } catch (err: any) {
    return { ok: false, reason: 'save-failed', detail: err?.response?.data?.message ?? err?.message };
  }
  return { ok: true };
}

export async function disablePushNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api.delete('/push/subscribe', { data: { endpoint: subscription.endpoint } }).catch(() => null);
  await subscription.unsubscribe();
}
