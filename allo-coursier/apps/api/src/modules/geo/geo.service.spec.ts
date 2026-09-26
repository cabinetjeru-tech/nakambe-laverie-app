import { City, Zone } from '@prisma/client';
import { locatePoint } from './geo.service';

const now = new Date();
const city = (id: string, lat: number, lng: number, radius: number, isActive = true): City & { zones: Zone[] } => ({
  id,
  name: id,
  slug: id,
  countryCode: 'BF',
  centerLat: lat,
  centerLng: lng,
  serviceRadiusKm: radius,
  timezone: 'Africa/Ouagadougou',
  currency: 'XOF',
  isActive,
  createdAt: now,
  updatedAt: now,
  zones: [],
});
const zone = (id: string, cityId: string, ring: number[][], priority = 0): Zone => ({
  id,
  cityId,
  name: id,
  polygon: { type: 'Polygon', coordinates: [ring] },
  priority,
  isActive: true,
  createdAt: now,
  updatedAt: now,
});

describe('locatePoint', () => {
  const ouaga = city('ouaga', 12.3714, -1.5197, 15);
  const tenko = city('tenko', 11.78, -0.3697, 8);
  const square = [[-1.55, 12.34], [-1.49, 12.34], [-1.49, 12.4], [-1.55, 12.4], [-1.55, 12.34]];

  it('trouve la ville par son rayon de service', () => {
    expect(locatePoint({ lat: 12.35, lng: -1.5 }, [ouaga, tenko])?.city.id).toBe('ouaga');
    expect(locatePoint({ lat: 11.79, lng: -0.36 }, [ouaga, tenko])?.city.id).toBe('tenko');
  });

  it('renvoie null hors des zones desservies', () => {
    expect(locatePoint({ lat: 11.18, lng: -4.29 }, [ouaga, tenko])).toBeNull(); // Bobo-Dioulasso
  });

  it('privilégie la zone de plus haute priorité', () => {
    const withZones = {
      ...ouaga,
      zones: [zone('centre', 'ouaga', square, 0), zone('prioritaire', 'ouaga', square, 5)],
    };
    const loc = locatePoint({ lat: 12.37, lng: -1.52 }, [withZones, tenko]);
    expect(loc?.zone?.id).toBe('prioritaire');
  });

  it('ignore les villes inactives', () => {
    expect(locatePoint({ lat: 11.79, lng: -0.36 }, [ouaga, { ...tenko, isActive: false }])).toBeNull();
  });
});
