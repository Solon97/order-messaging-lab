import { Inject, Injectable } from '@nestjs/common';
import {
  Order,
  CreateOrderProps,
} from '@/order/domain/entities/order.aggregate';
import type { OrderRepository } from '@/order/domain/repositories/order-repository';
import { ORDER_REPOSITORY } from './order-repository.token';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
  ) {}

  async execute(input: CreateOrderProps): Promise<Order> {
    const order = Order.create(input);
    await this.orderRepository.save(order);
    return order;
  }
}
