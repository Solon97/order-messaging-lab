import { Module } from '@nestjs/common';
import { OrdersModule } from './order/order.module';
import { HealthModule } from './shared/http/health.module';

@Module({
  imports: [OrdersModule, HealthModule],
})
export class AppModule {}
