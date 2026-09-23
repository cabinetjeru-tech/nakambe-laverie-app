export interface LatLng {
  lat: number;
  lng: number;
}

/** Polygone GeoJSON : coordonnées en [longitude, latitude]. */
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

const EARTH_RADIUS_KM = 6371.0088;

/** Distance à vol d'oiseau en kilomètres (formule de haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Point dans un anneau (lancer de rayon). L'anneau est une liste de [lng, lat]. */
function pointInRing(point: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Point dans un polygone GeoJSON (anneau extérieur moins les éventuels trous). */
export function pointInPolygon(point: LatLng, polygon: GeoJsonPolygon): boolean {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer || !pointInRing(point, outer)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

/** Renvoie un message d'erreur si l'objet n'est pas un polygone GeoJSON exploitable. */
export function polygonValidationError(value: unknown): string | null {
  const poly = value as GeoJsonPolygon;
  if (!poly || poly.type !== 'Polygon' || !Array.isArray(poly.coordinates) || poly.coordinates.length === 0) {
    return 'La zone doit être un polygone GeoJSON ({ "type": "Polygon", "coordinates": [...] }).';
  }
  for (const ring of poly.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return 'Chaque contour de la zone doit comporter au moins 3 points distincts (et être fermé).';
    }
    for (const pos of ring) {
      if (!Array.isArray(pos) || pos.length < 2) return 'Coordonnée de zone invalide.';
      const [lng, lat] = pos;
      if (typeof lng !== 'number' || typeof lat !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return 'Coordonnée de zone hors limites (format attendu : [longitude, latitude]).';
      }
    }
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return 'Chaque contour de la zone doit être fermé (le dernier point égal au premier).';
    }
  }
  return null;
}
