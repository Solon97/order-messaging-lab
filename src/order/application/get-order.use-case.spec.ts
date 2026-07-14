import { GetOrderUseCase } from './get-order.use-case';
import { InMemoryOrderRepository } from '@/order/infrastructure/persistence/in-memory-order.repository';
import { Order } from '@/order/domain/entities/order.aggregate';
import { OrderNotFoundError } from '@/order/domain/errors/order-not-found.error';

describe('GetOrderUseCase', () => {
  it('returns the order when found', async () => {
    const repository = new InMemoryOrderRepository();
    const orderResult = Order.create({
      customerId: 'customer-1',
      items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 10 }],
    });
    if (!orderResult.isRight()) {
      throw new Error('expected right');
    }
    const order = orderResult.value;
    await repository.save(order);
    const useCase = new GetOrderUseCase(repository);

    const result = await useCase.execute(order.orderId);

    if (!result.isRight()) {
      throw new Error('expected right');
    }
    expect(result.value).toBe(order);
  });

  it('returns left with OrderNotFoundError when the order is not found', async () => {
    const repository = new InMemoryOrderRepository();
    const useCase = new GetOrderUseCase(repository);

    const result = await useCase.execute('unknown-id');

    if (!result.isLeft()) {
      throw new Error('expected left');
    }
    expect(result.value).toBeInstanceOf(OrderNotFoundError);
  });
});
