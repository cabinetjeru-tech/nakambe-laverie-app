"use client";
import { useEffect, useRef, useState } from "react";

type JitsiApi = { dispose: () => void };
declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

/** Intégration Jitsi Meet via l'API externe officielle (script chargé depuis le domaine configuré). */
export function JitsiRoom({ domain, room, jwt, displayName, email, lowData }: { domain: string; room: string; jwt: string | null; displayName: string; email: string; lowData: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let api: JitsiApi | null = null;
    const start = () => {
      if (!window.JitsiMeetExternalAPI || !ref.current) return setError("Impossible de charger la visioconférence.");
      api = new window.JitsiMeetExternalAPI(domain, {
        roomName: room,
        parentNode: ref.current,
        jwt: jwt ?? undefined,
        width: "100%",
        height: "100%",
        lang: "fr",
        userInfo: { displayName, email },
        configOverwrite: {
          prejoinPageEnabled: true,
          startWithVideoMuted: lowData,
          startAudioOnly: lowData,
          resolution: lowData ? 180 : 480,
          constraints: { video: { height: { ideal: lowData ? 180 : 480, max: 720 } } },
          disableDeepLinking: false,
        },
        interfaceConfigOverwrite: { MOBILE_APP_PROMO: false },
      });
    };
    if (window.JitsiMeetExternalAPI) start();
    else {
      const script = document.createElement("script");
      script.src = `https://${domain}/external_api.js`;
      script.async = true;
      script.onload = start;
      script.onerror = () => setError("Le service de visioconférence est injoignable. Vérifiez votre connexion.");
      document.body.appendChild(script);
    }
    return () => api?.dispose();
  }, [domain, room, jwt, displayName, email, lowData]);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-navy">
      {error ? <div className="p-6 text-sm text-white">{error}</div> : <div ref={ref} className="h-[70dvh] min-h-[420px] w-full" />}
    </div>
  );
}
