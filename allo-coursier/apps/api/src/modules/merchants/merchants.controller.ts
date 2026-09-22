import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireRoles } from '../../common/decorators/roles.decorator';
import { PERMISSIONS, ROLE } from '../../common/permissions';
import { CatalogService } from './catalog.service';
import {
  AddMemberDto,
  AdminCreateMerchantDto,
  AdminMerchantQueryDto,
  AdminUpdateMerchantDto,
  BusinessDto,
  CategoryDto,
  ClosureDto,
  MerchantQueryDto,
  OpenOverrideDto,
  PartnerSignupDto,
  ProductDto,
  SetHoursDto,
  UpdateMerchantProfileDto,
  UpdateProductDto,
} from './dto/merchants.dto';
import { MerchantsService } from './merchants.service';

@ApiTags('Commerçants — public')
@Controller()
export class PublicMerchantsController {
  constructor(private merchants: MerchantsService) {}

  @Public()
  @Get('merchants')
  list(@Query() query: MerchantQueryDto) {
    return this.merchants.listPublic(query);
  }

  @Public()
  @Get('merchants/:slug')
  get(@Param('slug') slug: string) {
    return this.merchants.getPublic(slug);
  }

  /** Inscription d'un nouveau commerce avec création du compte du responsable. */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('partners/register')
  register(@Body() dto: PartnerSignupDto) {
    return this.merchants.signup(dto);
  }

  /** Demande depuis un compte existant. */
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('partners/apply')
  apply(@CurrentUser() user: AuthUser, @Body() dto: BusinessDto) {
    return this.merchants.apply(user.id, dto);
  }
}

@ApiTags('Espace commerçant')
@ApiBearerAuth()
@RequireRoles(ROLE.MERCHANT)
@Controller('merchant')
export class MerchantSpaceController {
  constructor(
    private merchants: MerchantsService,
    private catalog: CatalogService,
  ) {}

  @Get('memberships')
  memberships(@CurrentUser() user: AuthUser) {
    return this.merchants.memberships(user.id);
  }

  @Get(':merchantId')
  get(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.merchants.mine(user.id, merchantId);
  }

  @Patch(':merchantId')
  update(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() dto: UpdateMerchantProfileDto) {
    return this.merchants.updateProfile(user.id, merchantId, dto);
  }

  @Put(':merchantId/hours')
  hours(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() dto: SetHoursDto) {
    return this.merchants.setHours(user.id, merchantId, dto.hours);
  }

  @Put(':merchantId/open')
  open(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() dto: OpenOverrideDto) {
    return this.merchants.setOpenOverride(user.id, merchantId, dto.isOpenOverride ?? null);
  }

  @Post(':merchantId/closures')
  addClosure(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() dto: ClosureDto) {
    return this.merchants.addClosure(user.id, merchantId, dto);
  }

  @Delete(':merchantId/closures/:id')
  deleteClosure(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.merchants.deleteClosure(user.id, merchantId, id);
  }

  @Post(':merchantId/members')
  addMember(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() dto: AddMemberDto) {
    return this.merchants.addMember(user.id, merchantId, dto);
  }

  @Delete(':merchantId/members/:userId')
  removeMember(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('userId', ParseUUIDPipe) memberId: string) {
    return this.merchants.removeMember(user.id, merchantId, memberId);
  }

  @Get(':merchantId/catalog')
  getCatalog(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.catalog.catalog(user.id, merchantId);
  }

  @Post(':merchantId/categories')
  createCategory(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() dto: CategoryDto) {
    return this.catalog.createCategory(user.id, merchantId, dto);
  }

  @Patch(':merchantId/categories/:id')
  updateCategory(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto) {
    return this.catalog.updateCategory(user.id, merchantId, id, dto);
  }

  @Delete(':merchantId/categories/:id')
  deleteCategory(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteCategory(user.id, merchantId, id);
  }

  @Post(':merchantId/products')
  createProduct(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() dto: ProductDto) {
    return this.catalog.createProduct(user.id, merchantId, dto);
  }

  @Patch(':merchantId/products/:id')
  updateProduct(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(user.id, merchantId, id, dto);
  }

  @Delete(':merchantId/products/:id')
  deleteProduct(@CurrentUser() user: AuthUser, @Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteProduct(user.id, merchantId, id);
  }
}

@ApiTags('Administration — Commerçants')
@ApiBearerAuth()
@Controller('admin/merchants')
export class AdminMerchantsController {
  constructor(private merchants: MerchantsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MERCHANTS_MANAGE.code)
  list(@Query() query: AdminMerchantQueryDto, @CurrentUser() user: AuthUser) {
    return this.merchants.adminList(query, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.MERCHANTS_MANAGE.code)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.merchants.adminGet(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MERCHANTS_MANAGE.code)
  create(@Body() dto: AdminCreateMerchantDto, @CurrentUser() user: AuthUser) {
    return this.merchants.adminCreate(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MERCHANTS_MANAGE.code)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateMerchantDto, @CurrentUser() user: AuthUser) {
    return this.merchants.adminUpdate(id, dto, user);
  }
}
