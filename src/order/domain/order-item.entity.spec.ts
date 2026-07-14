import { OrderItem } from './order-item.entity';
import { InvalidOrderItemError } from './errors/invalid-order-item.error';

describe('OrderItem', () => {
  describe('create', () => {
    it('creates a valid OrderItem with the given sku, quantity and unitPrice', () => {
      const item = OrderItem.create({ sku: 'SKU-1', quantity: 3, unitPrice: 10.5 });

      expect(item.sku).toBe('SKU-1');
      expect(item.quantity).toBe(3);
      expect(item.unitPrice.amount).toBe(10.5);
      expect(typeof item.orderItemId).toBe('string');
      expect(item.orderItemId.length).toBeGreaterThan(0);
    });

    it('throws InvalidOrderItemError when sku is empty', () => {
      expect(() => OrderItem.create({ sku: '', quantity: 1, unitPrice: 1 })).toThrow(InvalidOrderItemError);
    });

    it('throws InvalidOrderItemError when sku is missing', () => {
      expect(() =>
        OrderItem.create({ sku: undefined as unknown as string, quantity: 1, unitPrice: 1 }),
      ).toThrow(InvalidOrderItemError);
    });

    it('throws InvalidOrderItemError when quantity is less than or equal to zero', () => {
      expect(() => OrderItem.create({ sku: 'SKU-1', quantity: 0, unitPrice: 1 })).toThrow(InvalidOrderItemError);
      expect(() => OrderItem.create({ sku: 'SKU-1', quantity: -1, unitPrice: 1 })).toThrow(InvalidOrderItemError);
    });

    it('throws InvalidOrderItemError when unitPrice is negative', () => {
      expect(() => OrderItem.create({ sku: 'SKU-1', quantity: 1, unitPrice: -0.01 })).toThrow(
        InvalidOrderItemError,
      );
    });

    it('assigns distinct orderItemIds to two items with identical sku/quantity/unitPrice', () => {
      const first = OrderItem.create({ sku: 'SKU-1', quantity: 2, unitPrice: 5 });
      const second = OrderItem.create({ sku: 'SKU-1', quantity: 2, unitPrice: 5 });

      expect(first.orderItemId).not.toBe(second.orderItemId);
    });
  });
});
