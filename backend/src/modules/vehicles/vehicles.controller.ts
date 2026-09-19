import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { VehiclesService } from './vehicles.service';
import { UpdateVehicleLocationDto } from './dto/update-vehicle-location.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

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

  @Roles(RoleName.CHAUFFEUR)
  @Patch(':id/location')
  updateLocation(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.updateLocation(id, user.userId, dto);
  }
}
