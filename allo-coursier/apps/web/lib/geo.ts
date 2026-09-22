export interface LatLng {
  lat: number;
  lng: number;
}

export const CITY_CENTERS: Record<string, LatLng> = {
  ouagadougou: { lat: 12.3714, lng: -1.5197 },
  tenkodogo: { lat: 11.78, lng: -0.3697 },
};

/** Position actuelle du téléphone (précision élevée, délai court pour ne pas bloquer l'écran). */
export function currentPosition(timeout = 10_000): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Géolocalisation indisponible sur ce téléphone.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Autorisez la localisation dans les réglages du navigateur.'
              : 'Position introuvable. Placez le repère sur la carte.',
          ),
        ),
      { enableHighAccuracy: true, timeout, maximumAge: 5_000 },
    );
  });
}

export function googleMapsDirections(to: LatLng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;
}

/** Distance approximative en mètres entre deux points. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
