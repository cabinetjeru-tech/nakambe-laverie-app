import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { IsMoney } from '../../../core/http/money';
import { IsTrimmedName } from '../../../core/http/validators';

export const EXPENSE_METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;

export class ExpenseCategoryDto {
  @IsTrimmedName(60)
  name: string;
}

export class CreateExpenseDto {
  @IsUUID('all')
  salonId: string;

  @IsUUID('all')
  categoryId: string;

  @IsString()
  @Length(2, 200)
  label: string;

  @IsMoney(1)
  amount: number;

  /** CASH = payée depuis la caisse du salon (elle doit être ouverte). */
  @IsIn(EXPENSE_METHODS)
  paymentMethod: (typeof EXPENSE_METHODS)[number];

  @IsDateString({ strict: true })
  spentAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @IsOptional()
  @IsUUID('all')
  supplierId?: string;
}

export class ExpenseQueryDto {
  @IsOptional()
  @IsUUID('all')
  salonId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsUUID('all')
  categoryId?: string;
}

export class DeleteExpenseDto {
  @IsString()
  @Length(3, 300)
  reason: string;
}
