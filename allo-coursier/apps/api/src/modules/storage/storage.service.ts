import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilePurpose } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const URL_TTL_SECONDS = 3600;

/** Détecte le type réel du fichier à partir de ses premiers octets (on ne se fie pas au nom). */
export function detectMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Stockage des fichiers sur le disque du serveur (gratuit). Les fichiers ne sont jamais publics :
 * l'API délivre des liens signés valables une heure, uniquement aux personnes autorisées.
 * Un stockage externe (S3 compatible) pourra remplacer ce service sans changer les appelants.
 */
@Injectable()
export class StorageService {
  private readonly dir: string;
  private readonly secret: string;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.dir = path.resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET') + ':files';
  }

  async save(ownerId: string, purpose: FilePurpose, buffer: Buffer) {
    if (buffer.length > MAX_UPLOAD_BYTES) throw new BadRequestException('Fichier trop lourd (5 Mo maximum).');
    const mimeType = detectMimeType(buffer);
    if (!mimeType) throw new BadRequestException('Format non accepté : envoyez une photo (JPEG, PNG, WebP) ou un PDF.');
    if (mimeType === 'application/pdf' && purpose !== FilePurpose.DRIVER_DOCUMENT) {
      throw new BadRequestException('Seules les photos sont acceptées ici.');
    }
    const key = `${randomBytes(18).toString('base64url')}.${EXTENSIONS[mimeType]}`;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, key), buffer);
    await this.prisma.storedFile.create({ data: { key, ownerId, purpose, mimeType, size: buffer.length } });
    return { key, mimeType, size: buffer.length, url: purpose === FilePurpose.MERCHANT_MEDIA ? this.publicUrl(key) : this.signedUrl(key) };
  }

  /** Vérifie qu'un fichier envoyé appartient bien à l'utilisateur et correspond à l'usage attendu. */
  async assertOwned(key: string, ownerId: string, purposes: FilePurpose[]) {
    const file = await this.prisma.storedFile.findUnique({ where: { key } });
    if (!file || file.ownerId !== ownerId || !purposes.includes(file.purpose)) {
      throw new ForbiddenException('Fichier introuvable ou non autorisé : renvoyez la photo.');
    }
    return file;
  }

  signedUrl(key: string | null | undefined): string | null {
    if (!key) return null;
    const exp = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS;
    return `/api/v1/files/${encodeURIComponent(key)}?exp=${exp}&sig=${this.sign(key, exp)}`;
  }

  /** Lien permanent des médias publics des commerçants (logos, photos des plats), mis en cache par les téléphones. */
  publicUrl(key: string | null | undefined): string | null {
    return key ? `/api/v1/files/public/${encodeURIComponent(key)}` : null;
  }

  async readPublic(key: string) {
    if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(key)) throw new NotFoundException();
    const file = await this.prisma.storedFile.findUnique({ where: { key } });
    if (!file || file.purpose !== FilePurpose.MERCHANT_MEDIA) throw new NotFoundException();
    return { path: path.join(this.dir, key), mimeType: file.mimeType };
  }

  async read(key: string, exp: number, sig: string) {
    if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp|pdf)$/.test(key)) throw new NotFoundException();
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) throw new ForbiddenException('Lien expiré.');
    const expected = Buffer.from(this.sign(key, exp));
    const given = Buffer.from(sig ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new ForbiddenException('Lien invalide.');
    const file = await this.prisma.storedFile.findUnique({ where: { key } });
    if (!file) throw new NotFoundException();
    return { path: path.join(this.dir, key), mimeType: file.mimeType };
  }

  private sign(key: string, exp: number) {
    return createHmac('sha256', this.secret).update(`${key}:${exp}`).digest('base64url');
  }
}
