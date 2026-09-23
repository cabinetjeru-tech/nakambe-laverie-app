import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { CreateSalonDto, UpdateSalonDto } from './dto/salon.dto';
import { SalonsService } from './salons.service';

@Controller('salons')
export class SalonsController {
  constructor(private readonly salons: SalonsService) {}

  @RequirePermissions('salons.read')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.salons.list(user);
  }

  @RequirePermissions('salons.read')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.salons.get(user, id);
  }

  @RequirePermissions('salons.manage')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSalonDto) {
    return this.salons.create(user, dto);
  }

  @RequirePermissions('salons.manage')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: UpdateSalonDto) {
    return this.salons.update(user, id, dto);
  }
}
