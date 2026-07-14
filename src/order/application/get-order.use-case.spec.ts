import { GetOrderUseCase } from './get-order.use-case';
import { InMemoryOrderRepository } from '@/order/infrastructure/persistence/in-memory-order.repository';
import { Order } from '@/order/domain/entities/order.aggregate';

describe('GetOrderUseCase', () => {
  it('returns the order when found', async () => {
    const repository = new InMemoryOrderRepository();
    const order = Order.create({
      customerId: 'customer-1',
      items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 10 }],
    });
    await repository.save(order);
    const useCase = new GetOrderUseCase(repository);

    const result = await useCase.execute(order.orderId);

    expect(result).toBe(order);
  });

  it('returns null when the order is not found', async () => {
    const repository = new InMemoryOrderRepository();
    const useCase = new GetOrderUseCase(repository);

    const result = await useCase.execute('unknown-id');

    expect(result).toBeNull();
  });
});
