import { Inject, Injectable } from '@nestjs/common';
import { Order } from '@/order/domain/entities/order.aggregate';
import { OrderRepository } from '@/order/domain/repositories/order-repository';
import { ORDER_REPOSITORY } from './order-repository.token';

@Injectable()
export class GetOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
  ) {}

  async execute(orderId: string): Promise<Order | null> {
    return this.orderRepository.findById(orderId);
  }
}
