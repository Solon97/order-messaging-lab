import { Module } from '@nestjs/common';
import { CreateOrderUseCase } from './application/create-order.use-case';
import { GetOrderUseCase } from './application/get-order.use-case';
import { ORDER_REPOSITORY } from './application/order-repository.token';
import { InMemoryOrderRepository } from './infrastructure/persistence/in-memory-order.repository';

@Module({
  providers: [
    CreateOrderUseCase,
    GetOrderUseCase,
    {
      provide: ORDER_REPOSITORY,
      useFactory: () => {
        const provider = process.env.PERSISTENCE_PROVIDER ?? 'IN_MEMORY';
        switch (provider) {
          case 'IN_MEMORY':
            return new InMemoryOrderRepository();
          default:
            throw new Error(`Unsupported PERSISTENCE_PROVIDER: ${provider}`);
        }
      },
    },
  ],
  exports: [CreateOrderUseCase, GetOrderUseCase],
})
export class OrdersModule {}
