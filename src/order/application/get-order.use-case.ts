import { Inject, Injectable } from '@nestjs/common';
import { Either, left, right } from '@/shared/either';
import { Order } from '@/order/domain/entities/order.aggregate';
import { OrderNotFoundError } from '@/order/domain/errors/order-not-found.error';
import type { OrderRepository } from '@/order/domain/repositories/order-repository';
import { ORDER_REPOSITORY } from './order-repository.token';

@Injectable()
export class GetOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
  ) {}

  async execute(orderId: string): Promise<Either<OrderNotFoundError, Order>> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      return left(new OrderNotFoundError(orderId));
    }
    return right(order);
  }
}
