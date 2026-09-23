import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

/** Horaires proposés à l'ouverture d'un salon : du lundi au samedi, 8 h – 20 h (modifiables). */
export const DEFAULT_OPENING_HOURS = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: '08:00', closesAt: '20:00' }));

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Loyer',
  'Électricité',
  'Eau',
  'Salaires et avances',
  'Produits et fournitures',
  'Transport',
  'Entretien et réparations',
  'Communication et publicité',
  'Impôts et taxes',
  'Autre',
];

/** Données par défaut d'un tenant : créées à l'inscription, complétées au besoin. */
@Injectable()
export class TenantDefaultsService {
  constructor(private readonly db: DbService) {}

  async openingHoursForNewSalon(salonId: string): Promise<void> {
    await this.db.tx.salonOpeningHour.createMany({
      data: DEFAULT_OPENING_HOURS.map((h) => ({ tenantId: this.db.tenantId!, salonId, ...h })),
    });
  }

  async ensureExpenseCategories(): Promise<void> {
    const count = await this.db.tx.expenseCategory.count();
    if (count > 0) return;
    await this.db.tx.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ tenantId: this.db.tenantId!, name })),
      skipDuplicates: true,
    });
  }

  /** Un employé nouvellement rattaché à un salon reçoit par défaut les horaires du salon. */
  async ensureStaffSchedule(staffId: string, salonId: string): Promise<void> {
    const existing = await this.db.tx.staffSchedule.count({ where: { staffId, salonId } });
    if (existing > 0) return;
    const hours = await this.db.tx.salonOpeningHour.findMany({ where: { salonId } });
    if (hours.length === 0) return;
    await this.db.tx.staffSchedule.createMany({
      data: hours.map((h) => ({
        tenantId: this.db.tenantId!,
        staffId,
        salonId,
        weekday: h.weekday,
        startsAt: h.opensAt,
        endsAt: h.closesAt,
      })),
    });
  }
}
