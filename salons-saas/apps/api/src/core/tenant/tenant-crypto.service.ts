import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CryptoService } from '../security/crypto.service';

/**
 * Chiffrement applicatif des données sensibles d'un tenant (fiche technique, allergies…)
 * avec la clé de données PROPRE à ce tenant (AES-256-GCM). PostgreSQL ne voit jamais le
 * texte clair ; une fuite de la base sans la clé maîtresse ne révèle rien.
 */
@Injectable()
export class TenantCryptoService {
  private readonly keys = new Map<string, Buffer>();

  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
  ) {}

  async encrypt(plaintext: string): Promise<string> {
    const key = await this.currentKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['t1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
  }

  async decrypt(payload: string): Promise<string> {
    const [version, iv, tag, data] = payload.split('.');
    if (version !== 't1' || !iv || !tag || !data) throw new Error('Donnée chiffrée illisible');
    const key = await this.currentKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  private async currentKey(): Promise<Buffer> {
    const tenantId = this.db.tenantId;
    if (!tenantId) throw new Error('Chiffrement sans tenant courant');
    const cached = this.keys.get(tenantId);
    if (cached) return cached;
    const tenant = await this.db.tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { dataKeyEnc: true } });
    const key = this.crypto.unwrapDataKey(tenant.dataKeyEnc);
    this.keys.set(tenantId, key);
    return key;
  }
}
