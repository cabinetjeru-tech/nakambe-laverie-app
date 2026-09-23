import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('Santé')
@Controller()
export class AppController {
  constructor(private prisma: PrismaService) {}

  /** Vérification de bon fonctionnement (supervision, hébergeur). */
  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'allo-coursier-api', time: new Date().toISOString() };
  }
}
