import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { normalizeEmail, normalizePhone } from './phone';

const E164 = /^\+[1-9]\d{7,14}$/;

/** Numéro de téléphone normalisé en E.164 avant validation. */
export function IsPhone() {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? (normalizePhone(value) ?? value) : value)),
    IsString(),
    Matches(E164, { message: 'Numéro de téléphone invalide' }),
  );
}

export function IsNormalizedEmail() {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value)),
    IsEmail({}, { message: 'Adresse email invalide' }),
    MaxLength(254),
  );
}

/** Politique de mot de passe : 8 à 128 caractères (recommandations NIST 800-63B). */
export function IsNewPassword() {
  return applyDecorators(
    IsString(),
    Length(8, 128, { message: 'Le mot de passe doit contenir entre 8 et 128 caractères' }),
  );
}

export function IsTrimmedName(max = 120) {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)),
    IsString(),
    Length(2, max),
  );
}
