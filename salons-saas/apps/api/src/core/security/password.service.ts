import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Paramètres argon2id (OWASP) : 19 Mio de mémoire, 2 itérations. */
const HASH_OPTIONS: argon2.Options = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordService implements OnModuleInit {
  /** Empreinte factice : un identifiant inconnu coûte le même temps qu'un mot de passe faux. */
  private dummyHash = '';

  async onModuleInit() {
    this.dummyHash = await argon2.hash('mot-de-passe-factice', HASH_OPTIONS);
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, HASH_OPTIONS);
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    if (!hash) {
      await argon2.verify(this.dummyHash, password).catch(() => false);
      return false;
    }
    return argon2.verify(hash, password).catch(() => false);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, HASH_OPTIONS);
  }
}
