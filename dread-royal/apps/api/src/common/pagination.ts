import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number = 50;
  @IsOptional() @IsString() search?: string;
}

export function paginate(q: PageQuery) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 50;
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export class PeriodQuery {
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
