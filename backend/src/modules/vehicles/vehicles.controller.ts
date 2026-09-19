import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { VehiclesService } from './vehicles.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(private vehiclesService: VehiclesService) {}

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Post()
  create(@Body() dto: any) {
    return this.vehiclesService.create(dto);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Get()
  findAll() {
    return this.vehiclesService.findAll();
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.vehiclesService.update(id, dto);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
