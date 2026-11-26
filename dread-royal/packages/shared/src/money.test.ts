import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSaleTotals, computeCommission, formatFCFA, paymentStatusOf } from './money';
import { hasPermission, DEFAULT_ROLES } from './permissions';

test('formatFCFA', () => {
  assert.equal(formatFCFA(12500), '12 500 FCFA');
  assert.equal(formatFCFA(-1500), '-1 500 FCFA');
  assert.equal(formatFCFA(0, false), '0');
});

test('computeSaleTotals : lignes, remise, fidélité', () => {
  const t = computeSaleTotals([{ quantity: 1, unitPrice: 15000 }, { quantity: 2, unitPrice: 3500, lineDiscount: 500 }], 1000, 500);
  assert.equal(t.subtotal, 21500);
  assert.equal(t.total, 20000);
});

test('computeSaleTotals refuse une remise supérieure au total', () => {
  assert.throws(() => computeSaleTotals([{ quantity: 1, unitPrice: 1000 }], 2000));
  assert.throws(() => computeSaleTotals([{ quantity: 0, unitPrice: 1000 }]));
});

test('computeCommission', () => {
  assert.equal(computeCommission(15000, 'PERCENT', 30), 4500);
  assert.equal(computeCommission(15000, 'FIXED', 1000, 2), 2000);
  assert.equal(computeCommission(15000, 'NONE', 30), 0);
});

test('paymentStatusOf', () => {
  assert.equal(paymentStatusOf(10000, 0), 'UNPAID');
  assert.equal(paymentStatusOf(10000, 4000), 'PARTIAL');
  assert.equal(paymentStatusOf(10000, 10000), 'PAID');
});

test('permissions : le propriétaire a tout, le coiffeur non', () => {
  const owner = DEFAULT_ROLES.find((r) => r.code === 'OWNER')!.permissions as string[];
  const stylist = DEFAULT_ROLES.find((r) => r.code === 'STYLIST')!.permissions as string[];
  assert.ok(hasPermission(owner, 'users.manage'));
  assert.ok(!hasPermission(stylist, 'users.manage'));
  assert.ok(hasPermission(stylist, 'appointments.view_own'));
});
