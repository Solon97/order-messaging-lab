import { CreateOrderUseCase } from './create-order.use-case';
import { InMemoryOrderRepository } from '@/order/infrastructure/persistence/in-memory-order.repository';
import { EmptyOrderError } from '@/order/domain/errors/empty-order.error';
import { InvalidOrderItemError } from '@/order/domain/errors/invalid-order-item.error';

describe('CreateOrderUseCase', () => {
  it('persists and returns the created order with the correct total', async () => {
    const repository = new InMemoryOrderRepository();
    const useCase = new CreateOrderUseCase(repository);

    const order = await useCase.execute({
      customerId: 'customer-1',
      items: [{ sku: 'SKU-1', quantity: 2, unitPrice: 10.5 }],
    });

    expect(order.totalAmount.amount).toBe(21);
    expect(await repository.findById(order.orderId)).toBe(order);
  });

  it('propagates EmptyOrderError when items is empty', async () => {
    const repository = new InMemoryOrderRepository();
    const useCase = new CreateOrderUseCase(repository);

    await expect(
      useCase.execute({ customerId: 'customer-1', items: [] }),
    ).rejects.toThrow(EmptyOrderError);
  });

  it('propagates InvalidOrderItemError when an item is invalid', async () => {
    const repository = new InMemoryOrderRepository();
    const useCase = new CreateOrderUseCase(repository);

    await expect(
      useCase.execute({
        customerId: 'customer-1',
        items: [{ sku: 'SKU-1', quantity: -1, unitPrice: 10 }],
      }),
    ).rejects.toThrow(InvalidOrderItemError);
  });

  it('calls repository.save exactly once on success', async () => {
    const repository = new InMemoryOrderRepository();
    const saveSpy = jest.spyOn(repository, 'save');
    const useCase = new CreateOrderUseCase(repository);

    await useCase.execute({
      customerId: 'customer-1',
      items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 10 }],
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});
