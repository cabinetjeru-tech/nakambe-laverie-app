import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { ChatService } from './chat.service';
import { CourierService } from './courier.service';
import { DispatchService } from './dispatch.service';
import { DriverController } from './driver.controller';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderSchedulerService } from './order-scheduler.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PricingModule, PromotionsModule],
  controllers: [OrdersController, DriverController, AdminOrdersController],
  providers: [
    OrdersService,
    OrderLifecycleService,
    DispatchService,
    CourierService,
    ChatService,
    AdminOrdersService,
    OrderSchedulerService,
  ],
  exports: [OrdersService, OrderLifecycleService, DispatchService],
})
export class OrdersModule {}
