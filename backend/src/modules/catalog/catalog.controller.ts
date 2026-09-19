import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName, ServiceDomain } from '@prisma/client';
import { CatalogService } from './catalog.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Public()
  @Get('categories')
  findCategories(@Query('domain') domain?: ServiceDomain) {
    return this.catalogService.findCategories(domain);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Post('services')
  createService(@Body() dto: CreateServiceDto) {
    return this.catalogService.createService(dto);
  }

  @Public()
  @Get('services')
  findServices(@Query('domain') domain?: ServiceDomain) {
    return this.catalogService.findServices(domain);
  }

  @Public()
  @Get('services/:id')
  findOneService(@Param('id') id: string) {
    return this.catalogService.findOneService(id);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Patch('services/:id')
  updateService(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.catalogService.updateService(id, dto);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Delete('services/:id')
  removeService(@Param('id') id: string) {
    return this.catalogService.removeService(id);
  }
}
