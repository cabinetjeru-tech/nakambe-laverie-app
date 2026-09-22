import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { STRAIGHT_LINE_ROUTING, RoutingService } from './routing.service';

@Module({
  controllers: [GeoController],
  providers: [GeoService, RoutingService, STRAIGHT_LINE_ROUTING],
  exports: [GeoService, RoutingService],
})
export class GeoModule {}
