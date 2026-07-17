import { Module } from '@nestjs/common';
import { OrdersModule } from './order/order.module';
import { HealthModule } from './shared/http/health.module';
import { AuthModule } from './shared/auth/auth.module';

@Module({
  imports: [AuthModule, OrdersModule, HealthModule],
})
export class AppModule {}
