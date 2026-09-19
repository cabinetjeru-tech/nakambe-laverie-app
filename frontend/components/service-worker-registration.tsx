'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // échec silencieux : l'app reste utilisable sans le cache hors-ligne
      });
    }
  }, []);
  return null;
}
