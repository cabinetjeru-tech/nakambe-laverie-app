import { ConflictException, Injectable } from '@nestjs/common';
import { DbService } from '../../core/db/db.service';

/** Session de caisse ouverte d'un salon (obligatoire pour tout mouvement d'espèces). */
@Injectable()
export class OpenSessionService {
  constructor(private readonly db: DbService) {}

  async find(salonId: string) {
    return this.db.tx.cashSession.findFirst({
      where: { status: 'OPEN', register: { salonId } },
      select: { id: true, registerId: true, openedAt: true, openingFloat: true },
      orderBy: { openedAt: 'desc' },
    });
  }

  async require(salonId: string) {
    const session = await this.find(salonId);
    if (!session) throw new ConflictException('La caisse de ce salon est fermée : ouvrez-la avant tout mouvement d’espèces.');
    return session;
  }
}
