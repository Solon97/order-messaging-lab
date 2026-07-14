import { InMemoryOrderRepository } from './in-memory-order.repository';
import { Order } from '@/order/domain/entities/order.aggregate';

function createOrder(customerId: string): Order {
  const result = Order.create({
    customerId,
    items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 10 }],
  });
  if (!result.isRight()) {
    throw new Error('expected right');
  }
  return result.value;
}

describe('InMemoryOrderRepository', () => {
  it('returns the saved order when found by id', async () => {
    const repository = new InMemoryOrderRepository();
    const order = createOrder('customer-1');

    await repository.save(order);
    const found = await repository.findById(order.orderId);

    expect(found).toBe(order);
  });

  it('returns null when the order id is unknown', async () => {
    const repository = new InMemoryOrderRepository();

    const found = await repository.findById('unknown-id');

    expect(found).toBeNull();
  });

  it('keeps orders from multiple save calls independently retrievable', async () => {
    const repository = new InMemoryOrderRepository();
    const orderA = createOrder('customer-1');
    const orderB = createOrder('customer-2');

    await repository.save(orderA);
    await repository.save(orderB);

    expect(await repository.findById(orderA.orderId)).toBe(orderA);
    expect(await repository.findById(orderB.orderId)).toBe(orderB);
  });
});
