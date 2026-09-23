'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng } from '@/lib/geo';

export type MarkerKind = 'pickup' | 'dropoff' | 'driver' | 'driver-busy' | 'order' | 'point';

export interface MapMarker extends LatLng {
  id?: string;
  kind: MarkerKind;
  label?: string;
  onClick?: () => void;
}

const COLORS: Record<MarkerKind, { bg: string; text: string; glyph: string }> = {
  pickup: { bg: '#2F80ED', text: '#fff', glyph: 'A' },
  dropoff: { bg: '#1DB954', text: '#fff', glyph: 'B' },
  driver: { bg: '#0B2A5B', text: '#fff', glyph: '🛵' },
  'driver-busy': { bg: '#F59E0B', text: '#fff', glyph: '🛵' },
  order: { bg: '#DC2626', text: '#fff', glyph: '•' },
  point: { bg: '#0B2A5B', text: '#fff', glyph: '•' },
};

function icon(kind: MarkerKind) {
  const c = COLORS[kind];
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${c.bg};color:${c.text};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${c.glyph}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function FitBounds({ points, keepZoom }: { points: LatLng[]; keepZoom?: boolean }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1 || keepZoom) {
      map.setView([points[0].lat, points[0].lng], keepZoom ? map.getZoom() : 15, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function ClickHandler({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function CenterTracker({ onMove }: { onMove: (p: LatLng) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      onMove({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
}

function Recenter({ center, token }: { center: LatLng; token?: number }) {
  const map = useMap();
  useEffect(() => {
    if (token) map.setView([center.lat, center.lng], Math.max(map.getZoom(), 16), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return null;
}

export interface LeafletMapProps {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  line?: LatLng[];
  polygons?: { id: string; points: LatLng[]; color?: string; label?: string }[];
  draftPolygon?: LatLng[];
  fit?: LatLng[];
  keepZoomOnFit?: boolean;
  onMapClick?: (p: LatLng) => void;
  /** Mode « épingle centrale » : la carte bouge sous une épingle fixe. */
  onCenterChange?: (p: LatLng) => void;
  recenterToken?: number;
  className?: string;
}

export default function LeafletMap({
  center,
  zoom = 13,
  markers = [],
  line,
  polygons = [],
  draftPolygon,
  fit,
  keepZoomOnFit,
  onMapClick,
  onCenterChange,
  recenterToken,
  className,
}: LeafletMapProps) {
  const icons = useMemo(() => Object.fromEntries((Object.keys(COLORS) as MarkerKind[]).map((k) => [k, icon(k)])), []);
  return (
    <div className={className ?? 'h-64 w-full'}>
      <MapContainer center={[center.lat, center.lng]} zoom={zoom} className="h-full w-full rounded-2xl" scrollWheelZoom attributionControl>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        {fit && <FitBounds points={fit} keepZoom={keepZoomOnFit} />}
        {onMapClick && <ClickHandler onClick={onMapClick} />}
        {onCenterChange && <CenterTracker onMove={onCenterChange} />}
        <Recenter center={center} token={recenterToken} />
        {polygons.map((p) => (
          <Polygon key={p.id} positions={p.points.map((x) => [x.lat, x.lng] as [number, number])} pathOptions={{ color: p.color ?? '#2F80ED', weight: 2, fillOpacity: 0.12 }}>
            {p.label && <Tooltip sticky>{p.label}</Tooltip>}
          </Polygon>
        ))}
        {draftPolygon && draftPolygon.length > 0 && (
          <>
            <Polygon positions={draftPolygon.map((x) => [x.lat, x.lng] as [number, number])} pathOptions={{ color: '#1DB954', weight: 3, dashArray: '6 6', fillOpacity: 0.15 }} />
            {draftPolygon.map((p, i) => (
              <CircleMarker key={i} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: '#138A3E', fillOpacity: 1 }} />
            ))}
          </>
        )}
        {line && line.length > 1 && <Polyline positions={line.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#2F80ED', weight: 4, opacity: 0.8 }} />}
        {markers.map((m, i) => (
          <Marker key={m.id ?? `${m.kind}-${i}`} position={[m.lat, m.lng]} icon={icons[m.kind]} eventHandlers={m.onClick ? { click: m.onClick } : undefined}>
            {m.label && <Tooltip direction="top" offset={[0, -16]}>{m.label}</Tooltip>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
