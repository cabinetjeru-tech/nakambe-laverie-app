import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { ChatService } from './chat.service';
import { CourierService } from './courier.service';
import { DispatchService } from './dispatch.service';
import { DriverController } from './driver.controller';
import { FoodService } from './food.service';
import { FoodController, MerchantOrdersController } from './food.controller';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderSchedulerService } from './order-scheduler.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PricingModule, PromotionsModule, MerchantsModule],
  controllers: [OrdersController, DriverController, AdminOrdersController, FoodController, MerchantOrdersController],
  providers: [
    OrdersService,
    OrderLifecycleService,
    DispatchService,
    CourierService,
    ChatService,
    AdminOrdersService,
    OrderSchedulerService,
    FoodService,
  ],
  exports: [OrdersService, OrderLifecycleService, DispatchService, FoodService],
})
export class OrdersModule {}
