import { Order } from '@/order/domain/entities/order.aggregate';
import { OrderRepository } from '@/order/domain/repositories/order-repository';

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  save(order: Order): Promise<void> {
    this.orders.set(order.orderId, order);
    return Promise.resolve();
  }

  findById(orderId: string): Promise<Order | null> {
    return Promise.resolve(this.orders.get(orderId) ?? null);
  }
}
