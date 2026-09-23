import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { CatalogService } from './catalog.service';
import { AdminMerchantsController, MerchantSpaceController, PublicMerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [GeoModule],
  controllers: [PublicMerchantsController, MerchantSpaceController, AdminMerchantsController],
  providers: [MerchantsService, CatalogService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
