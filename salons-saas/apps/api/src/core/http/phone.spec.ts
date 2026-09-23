import { normalizeEmail, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['70 12 34 56', '+22670123456'],
    ['70.12.34.56', '+22670123456'],
    ['+226 70 12 34 56', '+22670123456'],
    ['0022670123456', '+22670123456'],
    ['+33 6 12 34 56 78', '+33612345678'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['1234', 'abc', '+0123456789', '7012345'])('rejette %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('normalise les emails', () => {
    expect(normalizeEmail('  Awa@Exemple.BF ')).toBe('awa@exemple.bf');
  });
});
