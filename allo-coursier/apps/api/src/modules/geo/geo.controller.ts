import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { CreateCityDto, CreateZoneDto, LocateQueryDto, UpdateCityDto, UpdateZoneDto } from './dto/geo.dto';
import { GeoService } from './geo.service';

@ApiTags('Villes et zones')
@Controller()
export class GeoController {
  constructor(private geo: GeoService) {}

  // ------------------------------------------------------------------ public

  @Public()
  @Get('cities')
  listActiveCities() {
    return this.geo.listCities();
  }

  /** Indique si un point est desservi, et par quelle ville/zone. */
  @Public()
  @Get('geo/locate')
  async locate(@Query() query: LocateQueryDto) {
    const location = await this.geo.locate(query);
    return {
      served: !!location,
      city: location ? { id: location.city.id, name: location.city.name } : null,
      zone: location?.zone ? { id: location.zone.id, name: location.zone.name } : null,
    };
  }

  // ------------------------------------------------------------------ administration

  @ApiBearerAuth()
  @Get('admin/cities')
  @RequirePermissions(PERMISSIONS.CITIES_MANAGE.code)
  listAllCities() {
    return this.geo.listCities(true);
  }

  @ApiBearerAuth()
  @Get('admin/cities/:id')
  @RequirePermissions(PERMISSIONS.CITIES_MANAGE.code)
  getCity(@Param('id', ParseUUIDPipe) id: string) {
    return this.geo.getCity(id);
  }

  @ApiBearerAuth()
  @Post('admin/cities')
  @RequirePermissions(PERMISSIONS.CITIES_MANAGE.code)
  createCity(@Body() dto: CreateCityDto, @CurrentUser() user: AuthUser) {
    return this.geo.createCity(dto, user.id);
  }

  @ApiBearerAuth()
  @Patch('admin/cities/:id')
  @RequirePermissions(PERMISSIONS.CITIES_MANAGE.code)
  updateCity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCityDto, @CurrentUser() user: AuthUser) {
    return this.geo.updateCity(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Get('admin/cities/:cityId/zones')
  @RequirePermissions(PERMISSIONS.CITIES_MANAGE.code)
  listZones(@Param('cityId', ParseUUIDPipe) cityId: string) {
    return this.geo.listZones(cityId);
  }

  @ApiBearerAuth()
  @Post('admin/cities/:cityId/zones')
  @RequirePermissions(PERMISSIONS.CITIES_MANAGE.code)
  createZone(@Param('cityId', ParseUUIDPipe) cityId: string, @Body() dto: CreateZoneDto, @CurrentUser() user: AuthUser) {
    return this.geo.createZone(cityId, dto, user.id);
  }

  @ApiBearerAuth()
  @Patch('admin/zones/:id')
  @RequirePermissions(PERMISSIONS.CITIES_MANAGE.code)
  updateZone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateZoneDto, @CurrentUser() user: AuthUser) {
    return this.geo.updateZone(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Delete('admin/zones/:id')
  @RequirePermissions(PERMISSIONS.CITIES_MANAGE.code)
  deleteZone(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.geo.deleteZone(id, user.id);
  }
}
