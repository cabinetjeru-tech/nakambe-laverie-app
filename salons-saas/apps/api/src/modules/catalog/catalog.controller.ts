import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { CatalogService } from './catalog.service';
import { CategoryDto, CreateServiceDto, UpdateCategoryDto, UpdateServiceDto } from './dto/catalog.dto';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermissions('services.read')
  @Get('service-categories')
  categories() {
    return this.catalog.listCategories();
  }

  @RequirePermissions('services.manage')
  @Post('service-categories')
  createCategory(@Body() dto: CategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @RequirePermissions('services.manage')
  @Patch('service-categories/:id')
  updateCategory(@Param('id', ParseIdPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.catalog.updateCategory(id, dto);
  }

  @RequirePermissions('services.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('service-categories/:id')
  deleteCategory(@Param('id', ParseIdPipe) id: string) {
    return this.catalog.deleteCategory(id);
  }

  @RequirePermissions('services.read')
  @Get('services')
  services(@Query('includeInactive') includeInactive?: string) {
    return this.catalog.listServices(includeInactive === 'true');
  }

  @RequirePermissions('services.read')
  @Get('services/:id')
  service(@Param('id', ParseIdPipe) id: string) {
    return this.catalog.getService(id);
  }

  @RequirePermissions('services.manage')
  @Post('services')
  createService(@Body() dto: CreateServiceDto) {
    return this.catalog.createService(dto);
  }

  @RequirePermissions('services.manage')
  @Patch('services/:id')
  updateService(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: UpdateServiceDto) {
    return this.catalog.updateService(user, id, dto);
  }

  @RequirePermissions('services.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('services/:id')
  deleteService(@Param('id', ParseIdPipe) id: string) {
    return this.catalog.deleteService(id);
  }
}
