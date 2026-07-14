import { Inject, Injectable } from '@nestjs/common';
import { Either } from '@/shared/either';
import {
  Order,
  CreateOrderProps,
} from '@/order/domain/entities/order.aggregate';
import { EmptyOrderError } from '@/order/domain/errors/empty-order.error';
import { InvalidOrderItemError } from '@/order/domain/errors/invalid-order-item.error';
import type { OrderRepository } from '@/order/domain/repositories/order-repository';
import { ORDER_REPOSITORY } from './order-repository.token';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
  ) {}

  async execute(
    input: CreateOrderProps,
  ): Promise<Either<EmptyOrderError | InvalidOrderItemError, Order>> {
    const result = Order.create(input);
    if (result.isLeft()) {
      return result;
    }
    await this.orderRepository.save(result.value);
    return result;
  }
}
