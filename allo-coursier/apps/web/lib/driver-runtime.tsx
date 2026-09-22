'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { offlineQueue } from './offline-queue';
import { getSocket } from './socket';
import type { Offer, OrderDetail } from './types';
import { useApi } from './use-api';
import { ring } from './sound';

export interface DriverProfile {
  userId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  employmentType: 'SALARIE' | 'INDEPENDANT';
  vehicleType: string;
  plateNumber: string | null;
  isOnline: boolean;
  ratingAvg: number;
  ratingCount: number;
  rejectionReason: string | null;
  city: { id: string; name: string };
  documents: { id: string; type: string; status: string; rejectionReason: string | null; url: string | null; createdAt: string }[];
  cashDebt: number;
  cashDebtLimit: number;
  blockedByDebt: boolean;
}

interface DriverState {
  profile: DriverProfile | undefined;
  reloadProfile(): Promise<void>;
  online: boolean;
  setOnline(value: boolean): Promise<void>;
  toggling: boolean;
  error: string | null;
  offers: Offer[];
  respond(offerId: string, accept: boolean): Promise<string | null>;
  mission: OrderDetail | null | undefined;
  reloadMission(): Promise<void>;
  gpsStatus: 'off' | 'ok' | 'denied' | 'waiting';
  queued: number;
}

const DriverContext = createContext<DriverState | null>(null);

const SEND_INTERVAL_MOVING_MS = 8_000;
const SEND_INTERVAL_IDLE_MS = 45_000;
const MAX_BUFFER = 200;

export function DriverProvider({ children }: { children: ReactNode }) {
  const profile = useApi<DriverProfile>('/driver/profile', { refreshInterval: 120_000 });
  const missionApi = useApi<OrderDetail | null>('/driver/mission', { refreshInterval: 60_000 });
  const [online, setOnlineState] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [gpsStatus, setGpsStatus] = useState<DriverState['gpsStatus']>('off');
  const [queued, setQueued] = useState(0);
  const buffer = useRef<{ lat: number; lng: number; speed?: number; heading?: number; accuracy?: number; recordedAt: string }[]>([]);
  const lastSent = useRef(0);
  const moving = useRef(false);
  const wakeLock = useRef<{ release(): Promise<void> } | null>(null);

  useEffect(() => {
    if (profile.data) setOnlineState(profile.data.isOnline);
  }, [profile.data]);

  useEffect(() => offlineQueue.subscribe(setQueued), []);
  useEffect(() => setQueued(offlineQueue.size()), []);

  const flushPositions = useCallback(async (force = false) => {
    if (!buffer.current.length) return;
    const interval = moving.current ? SEND_INTERVAL_MOVING_MS : SEND_INTERVAL_IDLE_MS;
    if (!force && Date.now() - lastSent.current < interval) return;
    const points = buffer.current.slice(-MAX_BUFFER);
    try {
      await api('/driver/location', { body: { points } });
      buffer.current = buffer.current.slice(points.length);
      lastSent.current = Date.now();
    } catch {
      // hors ligne : les points restent en mémoire et partiront au retour du réseau
    }
  }, []);

  // Suivi GPS tant que le livreur est en ligne (ou en mission).
  const tracking = online || !!missionApi.data;
  useEffect(() => {
    if (!tracking || !('geolocation' in navigator)) {
      setGpsStatus('off');
      return;
    }
    setGpsStatus('waiting');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus('ok');
        moving.current = (pos.coords.speed ?? 0) > 1.5;
        buffer.current.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed ?? undefined,
          heading: pos.coords.heading ?? undefined,
          accuracy: pos.coords.accuracy,
          recordedAt: new Date(pos.timestamp).toISOString(),
        });
        if (buffer.current.length > MAX_BUFFER) buffer.current = buffer.current.slice(-MAX_BUFFER);
        void flushPositions();
      },
      (err) => setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'waiting'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    const timer = setInterval(() => void flushPositions(), 5_000);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
    };
  }, [tracking, flushPositions]);

  // Écran maintenu allumé pendant une mission (le navigateur coupe le GPS quand l'écran s'éteint).
  useEffect(() => {
    const active = !!missionApi.data && ['DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PURCHASING', 'IN_TRANSIT', 'ARRIVED_AT_DROPOFF'].includes(missionApi.data.status);
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
    const acquire = async () => {
      if (active && nav.wakeLock && !wakeLock.current && document.visibilityState === 'visible') {
        wakeLock.current = await nav.wakeLock.request('screen').catch(() => null);
      }
    };
    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener('visibilitychange', onVisible);
    if (!active && wakeLock.current) {
      void wakeLock.current.release();
      wakeLock.current = null;
    }
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [missionApi.data]);

  const refreshOffers = useCallback(async () => {
    try {
      setOffers(await api<Offer[]>('/driver/offers'));
    } catch {
      /* hors ligne */
    }
  }, []);

  // Offres : temps réel + vérification périodique (au cas où le temps réel a été coupé).
  useEffect(() => {
    if (!online) {
      setOffers([]);
      return;
    }
    void refreshOffers();
    const socket = getSocket();
    const onOffer = (offer: Offer) => {
      setOffers((prev) => [...prev.filter((o) => o.offerId !== offer.offerId), offer]);
      ring();
    };
    const onClosed = (e: { orderId: string }) => setOffers((prev) => prev.filter((o) => o.orderId !== e.orderId));
    const onOrder = () => void missionApi.reload();
    socket.on('offer.new', onOffer);
    socket.on('offer.closed', onClosed);
    socket.on('order.updated', onOrder);
    socket.on('connect', refreshOffers);
    const timer = setInterval(() => document.visibilityState === 'visible' && void refreshOffers(), 15_000);
    return () => {
      socket.off('offer.new', onOffer);
      socket.off('offer.closed', onClosed);
      socket.off('order.updated', onOrder);
      socket.off('connect', refreshOffers);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, refreshOffers]);

  // Nettoyage des offres expirées à l'écran.
  useEffect(() => {
    if (!offers.length) return;
    const timer = setInterval(() => setOffers((prev) => prev.filter((o) => new Date(o.expiresAt).getTime() > Date.now())), 1_000);
    return () => clearInterval(timer);
  }, [offers.length]);

  const setOnline = useCallback(
    async (value: boolean) => {
      setToggling(true);
      setError(null);
      try {
        let position: GeolocationPosition | null = null;
        if (value) {
          position = await new Promise<GeolocationPosition | null>((resolve) =>
            navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 10_000 }),
          );
          if (!position) throw new Error('Activez la localisation (GPS) pour recevoir des missions.');
        }
        await api('/driver/online', {
          body: { online: value, lat: position?.coords.latitude, lng: position?.coords.longitude },
        });
        setOnlineState(value);
        await flushPositions(true);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setToggling(false);
      }
    },
    [flushPositions],
  );

  const respond = useCallback(
    async (offerId: string, accept: boolean) => {
      setError(null);
      try {
        if (accept) {
          const order = await api<OrderDetail>(`/driver/offers/${offerId}/accept`, { method: 'POST' });
          setOffers([]);
          missionApi.mutate(order);
          return order.id;
        }
        await api(`/driver/offers/${offerId}/reject`, { body: {} });
        setOffers((prev) => prev.filter((o) => o.offerId !== offerId));
        return null;
      } catch (err) {
        setError((err as Error).message);
        void refreshOffers();
        return null;
      }
    },
    [missionApi, refreshOffers],
  );

  return (
    <DriverContext.Provider
      value={{
        profile: profile.data,
        reloadProfile: profile.reload,
        online,
        setOnline,
        toggling,
        error,
        offers,
        respond,
        mission: missionApi.data,
        reloadMission: missionApi.reload,
        gpsStatus,
        queued,
      }}
    >
      {children}
    </DriverContext.Provider>
  );
}

export function useDriver() {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error('useDriver doit être utilisé dans DriverProvider');
  return ctx;
}
