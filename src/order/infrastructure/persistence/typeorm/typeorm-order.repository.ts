import { Repository } from 'typeorm';
import { Order } from '@/order/domain/entities/order.aggregate';
import { OrderRepository } from '@/order/domain/repositories/order-repository';
import { OrderEntity } from './order.entity';
import { OrderMapper } from './order.mapper';

export class TypeOrmOrderRepository implements OrderRepository {
  constructor(private readonly repository: Repository<OrderEntity>) {}

  async save(order: Order): Promise<void> {
    await this.repository.save(OrderMapper.toEntity(order));
  }

  async findById(orderId: string): Promise<Order | null> {
    const entity = await this.repository.findOneBy({ orderId });
    return entity ? OrderMapper.toDomain(entity) : null;
  }
}
