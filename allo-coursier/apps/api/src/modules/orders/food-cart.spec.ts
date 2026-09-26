import { priceCart } from './food.service';

const PRODUCTS = [
  {
    id: 'riz',
    name: 'Riz gras',
    price: 1500,
    isAvailable: true,
    optionGroups: [
      { id: 'g1', name: 'Viande', minChoices: 1, maxChoices: 1, options: [{ id: 'boeuf', name: 'Bœuf', extraPrice: 0 }, { id: 'poulet', name: 'Poulet', extraPrice: 500 }] },
      { id: 'g2', name: 'Suppléments', minChoices: 0, maxChoices: 2, options: [{ id: 'oeuf', name: 'Œuf', extraPrice: 200 }, { id: 'alloco', name: 'Alloco', extraPrice: 300 }] },
    ],
  },
  { id: 'jus', name: 'Bissap', price: 500, isAvailable: true, optionGroups: [] },
  { id: 'fini', name: 'Poisson', price: 3000, isAvailable: false, optionGroups: [] },
];

describe('priceCart — prix du panier', () => {
  it('additionne produits, options et quantités', () => {
    const { lines, subtotal } = priceCart(
      [
        { productId: 'riz', quantity: 2, optionIds: ['poulet', 'oeuf', 'oeuf'] },
        { productId: 'jus', quantity: 3 },
      ],
      PRODUCTS,
    );
    expect(lines[0]).toMatchObject({ unitPrice: 2200, quantity: 2 });
    expect(lines[0].options.map((o) => o.name)).toEqual(['Poulet', 'Œuf']);
    expect(subtotal).toBe(2 * 2200 + 3 * 500);
  });

  it('refuse un panier vide, un produit indisponible ou inconnu', () => {
    expect(() => priceCart([], PRODUCTS)).toThrow(/vide/);
    expect(() => priceCart([{ productId: 'fini', quantity: 1 }], PRODUCTS)).toThrow(/plus disponible/);
    expect(() => priceCart([{ productId: 'autre', quantity: 1 }], PRODUCTS)).toThrow(/n’existe plus/);
  });

  it('vérifie le nombre de choix de chaque groupe', () => {
    expect(() => priceCart([{ productId: 'riz', quantity: 1 }], PRODUCTS)).toThrow(/choisissez viande/);
    expect(() => priceCart([{ productId: 'riz', quantity: 1, optionIds: ['boeuf', 'poulet'] }], PRODUCTS)).toThrow(/1 choix au maximum/);
    expect(() => priceCart([{ productId: 'jus', quantity: 1, optionIds: ['oeuf'] }], PRODUCTS)).toThrow(/option inconnue/);
  });
});
