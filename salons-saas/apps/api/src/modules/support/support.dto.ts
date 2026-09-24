import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export const SUPPORT_CATEGORIES = ['billing', 'bug', 'question', 'account', 'other'] as const;
export const SUPPORT_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;
export const SUPPORT_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export class CreateTicketDto {
  @IsString()
  @Length(4, 150)
  subject!: string;

  @IsIn(SUPPORT_CATEGORIES, { message: 'Catégorie inconnue' })
  category!: (typeof SUPPORT_CATEGORIES)[number];

  @IsString()
  @Length(10, 5000, { message: 'Décrivez votre demande (10 caractères minimum)' })
  body!: string;
}

export class TicketMessageDto {
  @IsString()
  @Length(1, 5000)
  body!: string;
}

export class PlatformTicketMessageDto extends TicketMessageDto {
  /** Note interne : visible uniquement de l'équipe plateforme. */
  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: (typeof SUPPORT_STATUSES)[number];

  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: (typeof SUPPORT_PRIORITIES)[number];

  /** Agent assigné (null pour désassigner). */
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;
}

export class TicketQueryDto {
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: (typeof SUPPORT_STATUSES)[number];

  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: (typeof SUPPORT_PRIORITIES)[number];

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsIn(['me', 'none'])
  assigned?: 'me' | 'none';
}
