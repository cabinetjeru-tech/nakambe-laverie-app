import { ApiProperty } from '@nestjs/swagger';
import { ServiceDomain } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ enum: ServiceDomain })
  @IsEnum(ServiceDomain)
  domain: ServiceDomain;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;
}
