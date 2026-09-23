import { ALL_PERMISSION_CODES, DEFAULT_ROLES, FEATURES, filterByFeatures, PLAN_DEFINITIONS } from './catalog';

describe('catalogue des permissions', () => {
  it('ne contient pas de doublon', () => {
    expect(new Set(ALL_PERMISSION_CODES).size).toBe(ALL_PERMISSION_CODES.length);
  });

  it('les rôles par défaut ne référencent que des permissions connues', () => {
    for (const role of DEFAULT_ROLES) {
      if (role.permissions === '*') continue;
      for (const code of role.permissions) expect(ALL_PERMISSION_CODES).toContain(code);
    }
  });

  it("le comptable n'accède ni aux fiches techniques ni aux photos", () => {
    const accountant = DEFAULT_ROLES.find((r) => r.code === 'ACCOUNTANT')!;
    expect(accountant.permissions).not.toContain('clients.technical.read');
    expect(accountant.permissions).not.toContain('clients.photos.manage');
  });

  it("retire les permissions dont la fonctionnalité n'est pas dans l'offre et ignore les codes inconnus", () => {
    const result = filterByFeatures(['stock.read', 'salons.read', 'inconnu.code'], new Set([FEATURES.ONLINE_BOOKING]));
    expect(result).toEqual(['salons.read']);
  });

  it("l'offre Multi-salons inclut toutes les fonctionnalités", () => {
    const multi = PLAN_DEFINITIONS.find((p) => p.code === 'MULTI')!;
    expect([...multi.features].sort()).toEqual(Object.values(FEATURES).sort());
  });
});
