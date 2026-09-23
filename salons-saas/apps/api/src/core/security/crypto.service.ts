import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/env';

/** Primitives cryptographiques de l'application (aucun secret n'est stocké en clair). */
@Injectable()
export class CryptoService {
  private readonly masterKey: Buffer;
  private readonly pepper: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.masterKey = Buffer.from(config.MASTER_KEY, 'base64');
    this.pepper = config.HASH_PEPPER;
  }

  /** Jeton aléatoire opaque (refresh token, invitation) : 256 bits, base64url. */
  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** Code numérique à usage unique (OTP). */
  numericCode(length = 6): string {
    return Array.from({ length }, () => randomInt(0, 10)).join('');
  }

  /**
   * Empreinte stockée en base à la place d'un jeton ou d'un code. HMAC avec un secret serveur :
   * une fuite de la base seule ne permet pas de tester des codes courts hors ligne.
   */
  fingerprint(value: string): string {
    return createHmac('sha256', this.pepper).update(value).digest('base64url');
  }

  safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  /** Nouvelle clé de données d'un tenant, chiffrée par la clé maîtresse (AES-256-GCM). */
  newWrappedDataKey(): string {
    return this.encrypt(randomBytes(32), this.masterKey);
  }

  private encrypt(plaintext: Buffer, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  unwrapDataKey(wrapped: string): Buffer {
    const [version, iv, tag, ciphertext] = wrapped.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Clé de données illisible');
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);
  }
}
