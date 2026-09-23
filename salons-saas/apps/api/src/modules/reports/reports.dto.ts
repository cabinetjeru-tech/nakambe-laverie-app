import { IsOptional, IsUUID, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  @IsOptional()
  @IsUUID('all')
  salonId?: string;

  @Matches(DATE, { message: 'Date au format AAAA-MM-JJ' })
  from: string;

  @Matches(DATE, { message: 'Date au format AAAA-MM-JJ' })
  to: string;
}

export class DashboardQueryDto {
  @IsUUID('all')
  salonId: string;
}
