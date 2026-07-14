import { CreateOrderUseCase } from './create-order.use-case';
import { InMemoryOrderRepository } from '@/order/infrastructure/persistence/in-memory-order.repository';
import { EmptyOrderError } from '@/order/domain/errors/empty-order.error';
import { InvalidOrderItemError } from '@/order/domain/errors/invalid-order-item.error';

describe('CreateOrderUseCase', () => {
  it('persists and returns the created order with the correct total', async () => {
    const repository = new InMemoryOrderRepository();
    const useCase = new CreateOrderUseCase(repository);

    const result = await useCase.execute({
      customerId: 'customer-1',
      items: [{ sku: 'SKU-1', quantity: 2, unitPrice: 10.5 }],
    });

    if (!result.isRight()) {
      throw new Error('expected right');
    }
    expect(result.value.totalAmount.amount).toBe(21);
    expect(await repository.findById(result.value.orderId)).toBe(result.value);
  });

  it('returns left with EmptyOrderError when items is empty', async () => {
    const repository = new InMemoryOrderRepository();
    const useCase = new CreateOrderUseCase(repository);

    const result = await useCase.execute({
      customerId: 'customer-1',
      items: [],
    });

    if (!result.isLeft()) {
      throw new Error('expected left');
    }
    expect(result.value).toBeInstanceOf(EmptyOrderError);
  });

  it('returns left with InvalidOrderItemError when an item is invalid', async () => {
    const repository = new InMemoryOrderRepository();
    const useCase = new CreateOrderUseCase(repository);

    const result = await useCase.execute({
      customerId: 'customer-1',
      items: [{ sku: 'SKU-1', quantity: -1, unitPrice: 10 }],
    });

    if (!result.isLeft()) {
      throw new Error('expected left');
    }
    expect(result.value).toBeInstanceOf(InvalidOrderItemError);
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

  it('does not call repository.save when creation fails', async () => {
    const repository = new InMemoryOrderRepository();
    const saveSpy = jest.spyOn(repository, 'save');
    const useCase = new CreateOrderUseCase(repository);

    await useCase.execute({ customerId: 'customer-1', items: [] });

    expect(saveSpy).not.toHaveBeenCalled();
  });
});
