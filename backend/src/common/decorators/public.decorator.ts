import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marque une route comme accessible sans authentification (ex: login, vitrine publique). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
