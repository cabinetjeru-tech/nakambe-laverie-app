import { applyDecorators } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';

/** Montant en unités entières de la devise (FCFA : pas de centimes). */
export function IsMoney(min = 0) {
  return applyDecorators(IsInt({ message: 'Montant entier attendu' }), Min(min), Max(10_000_000_000));
}

export const toMoney = (value: number | bigint | null | undefined): bigint => BigInt(value ?? 0);

export const sumMoney = (values: Iterable<bigint>): bigint => {
  let total = 0n;
  for (const value of values) total += value;
  return total;
};
