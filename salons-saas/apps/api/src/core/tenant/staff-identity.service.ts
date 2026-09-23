import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { DbService } from '../db/db.service';

/** Profil professionnel (staff_members) du membre connecté, pour les droits « .own ». */
@Injectable()
export class StaffIdentityService {
  constructor(private readonly db: DbService) {}

  async ownStaffId(user: AuthUser): Promise<string | null> {
    if (!user.membershipId) return null;
    const staff = await this.db.tx.staffMember.findFirst({ where: { membershipId: user.membershipId }, select: { id: true } });
    return staff?.id ?? null;
  }

  async requireOwnStaffId(user: AuthUser): Promise<string> {
    const id = await this.ownStaffId(user);
    if (!id) throw new ForbiddenException("Aucun profil professionnel n'est associé à votre compte.");
    return id;
  }
}
