import { haversineKm, pointInPolygon, polygonValidationError, GeoJsonPolygon } from './geo';
import { maskPhone, normalizeBurkinaPhone } from './phone';
import { generateTemporaryPassword, generateTemporaryPin, passwordPolicyError, pinPolicyError } from './secret-policy';
import { isTimeInRange, localTimeHHmm } from './time';

describe('normalizeBurkinaPhone', () => {
  it.each([
    ['70 12 34 56', '+22670123456'],
    ['+226 70-12-34-56', '+22670123456'],
    ['0022676000001', '+22676000001'],
    ['22656112233', '+22656112233'],
    ['25 30 00 00', '+22625300000'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeBurkinaPhone(input)).toBe(expected);
  });

  it.each(['', '7012345', '701234567', '+33612345678', '90123456', 'abcdefgh'])('refuse %s', (input) => {
    expect(normalizeBurkinaPhone(input)).toBeNull();
  });

  it('masque un numéro', () => {
    expect(maskPhone('+22670123456')).toBe('+226 70 •• •• 56');
  });
});

describe('politique des codes secrets', () => {
  it('accepte un PIN correct', () => {
    expect(pinPolicyError('482913')).toBeNull();
    expect(pinPolicyError('4829')).toBeNull();
  });

  it.each(['123', '1234567', '12a4', '0000', '111111', '1234', '6543', '456789'])('refuse le PIN %s', (pin) => {
    expect(pinPolicyError(pin)).not.toBeNull();
  });

  it('exige un mot de passe de 8 caractères avec lettre et chiffre', () => {
    expect(passwordPolicyError('AlloAdmin@2026')).toBeNull();
    expect(passwordPolicyError('court1')).not.toBeNull();
    expect(passwordPolicyError('sanschiffre')).not.toBeNull();
    expect(passwordPolicyError('12345678')).not.toBeNull();
  });

  it('génère des secrets temporaires conformes', () => {
    for (let i = 0; i < 200; i++) {
      expect(pinPolicyError(generateTemporaryPin())).toBeNull();
      expect(passwordPolicyError(generateTemporaryPassword())).toBeNull();
    }
  });
});

describe('géographie', () => {
  const square: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [[[-1.55, 12.34], [-1.49, 12.34], [-1.49, 12.4], [-1.55, 12.4], [-1.55, 12.34]]],
  };

  it('calcule la distance Ouagadougou — Tenkodogo (~ 130 km à vol d’oiseau)', () => {
    const d = haversineKm({ lat: 12.3714, lng: -1.5197 }, { lat: 11.78, lng: -0.3697 });
    expect(d).toBeGreaterThan(130);
    expect(d).toBeLessThan(145);
  });

  it('détecte un point dans un polygone', () => {
    expect(pointInPolygon({ lat: 12.37, lng: -1.52 }, square)).toBe(true);
    expect(pointInPolygon({ lat: 12.3, lng: -1.52 }, square)).toBe(false);
  });

  it('exclut les trous du polygone', () => {
    const withHole: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        square.coordinates[0],
        [[-1.53, 12.36], [-1.51, 12.36], [-1.51, 12.38], [-1.53, 12.38], [-1.53, 12.36]],
      ],
    };
    expect(pointInPolygon({ lat: 12.37, lng: -1.52 }, withHole)).toBe(false);
    expect(pointInPolygon({ lat: 12.395, lng: -1.54 }, withHole)).toBe(true);
  });

  it('valide le format des zones', () => {
    expect(polygonValidationError(square)).toBeNull();
    expect(polygonValidationError({ type: 'Point', coordinates: [0, 0] })).not.toBeNull();
    expect(polygonValidationError({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] })).not.toBeNull();
    expect(
      polygonValidationError({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }),
    ).toMatch(/fermé/);
    expect(
      polygonValidationError({ type: 'Polygon', coordinates: [[[0, 0], [1, 95], [1, 1], [0, 0]]] }),
    ).toMatch(/hors limites/);
  });
});

describe('heures', () => {
  it('donne l’heure locale au Burkina Faso (UTC+0)', () => {
    expect(localTimeHHmm(new Date('2026-06-01T22:05:00Z'), 'Africa/Ouagadougou')).toBe('22:05');
    expect(localTimeHHmm(new Date('2026-06-01T00:00:00Z'), 'Africa/Ouagadougou')).toBe('00:00');
  });

  it('gère les plages horaires normales et à cheval sur minuit', () => {
    expect(isTimeInRange('10:00', '08:00', '18:00')).toBe(true);
    expect(isTimeInRange('18:00', '08:00', '18:00')).toBe(false);
    expect(isTimeInRange('23:00', '21:00', '06:00')).toBe(true);
    expect(isTimeInRange('12:00', '21:00', '06:00')).toBe(false);
    expect(isTimeInRange('12:00', '12:00', '12:00')).toBe(false);
  });
});
