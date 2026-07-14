import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateOrderUseCase } from './application/create-order.use-case';
import { GetOrderUseCase } from './application/get-order.use-case';
import { ORDER_REPOSITORY } from './application/order-repository.token';
import { InMemoryOrderRepository } from './infrastructure/persistence/in-memory-order.repository';
import { OrderEntity } from './infrastructure/persistence/typeorm/order.entity';
import { OrderItemEntity } from './infrastructure/persistence/typeorm/order-item.entity';
import { typeOrmDataSourceOptions } from './infrastructure/persistence/typeorm/data-source';
import { TypeOrmOrderRepository } from './infrastructure/persistence/typeorm/typeorm-order.repository';
import { OrdersController } from './infrastructure/http/orders.controller';

const isPostgres = process.env.PERSISTENCE_PROVIDER === 'POSTGRES';

@Module({
  imports: isPostgres
    ? [
        TypeOrmModule.forRootAsync({
          useFactory: () => typeOrmDataSourceOptions,
        }),
        TypeOrmModule.forFeature([OrderEntity, OrderItemEntity]),
      ]
    : [],
  controllers: [OrdersController],
  providers: [
    CreateOrderUseCase,
    GetOrderUseCase,
    {
      provide: ORDER_REPOSITORY,
      useFactory: (orderRepository?: Repository<OrderEntity>) => {
        const provider = process.env.PERSISTENCE_PROVIDER ?? 'IN_MEMORY';
        switch (provider) {
          case 'IN_MEMORY':
            return new InMemoryOrderRepository();
          case 'POSTGRES':
            return new TypeOrmOrderRepository(orderRepository!);
          default:
            throw new Error(`Unsupported PERSISTENCE_PROVIDER: ${provider}`);
        }
      },
      inject: isPostgres ? [getRepositoryToken(OrderEntity)] : [],
    },
  ],
  exports: [CreateOrderUseCase, GetOrderUseCase],
})
export class OrdersModule {}
