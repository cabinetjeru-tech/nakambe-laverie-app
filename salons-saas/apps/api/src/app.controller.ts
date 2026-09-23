import { Controller, Get } from '@nestjs/common';
import { Public } from './core/auth/decorators';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
