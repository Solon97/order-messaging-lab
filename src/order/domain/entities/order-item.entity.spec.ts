import { OrderItem } from './order-item.entity';
import { InvalidOrderItemError } from '../errors/invalid-order-item.error';

describe('OrderItem', () => {
  describe('create', () => {
    it('creates a valid OrderItem with the given sku, quantity and unitPrice', () => {
      const result = OrderItem.create({
        sku: 'SKU-1',
        quantity: 3,
        unitPrice: 10.5,
      });

      if (!result.isRight()) {
        throw new Error('expected right');
      }
      expect(result.value.sku).toBe('SKU-1');
      expect(result.value.quantity).toBe(3);
      expect(result.value.unitPrice.amount).toBe(10.5);
      expect(typeof result.value.orderItemId).toBe('string');
      expect(result.value.orderItemId.length).toBeGreaterThan(0);
    });

    it('returns left with InvalidOrderItemError when sku is empty', () => {
      const result = OrderItem.create({ sku: '', quantity: 1, unitPrice: 1 });

      if (!result.isLeft()) {
        throw new Error('expected left');
      }
      expect(result.value).toBeInstanceOf(InvalidOrderItemError);
    });

    it('returns left with InvalidOrderItemError when sku is missing', () => {
      const result = OrderItem.create({
        sku: undefined as unknown as string,
        quantity: 1,
        unitPrice: 1,
      });

      if (!result.isLeft()) {
        throw new Error('expected left');
      }
      expect(result.value).toBeInstanceOf(InvalidOrderItemError);
    });

    it('returns left with InvalidOrderItemError when quantity is less than or equal to zero', () => {
      const zero = OrderItem.create({
        sku: 'SKU-1',
        quantity: 0,
        unitPrice: 1,
      });
      const negative = OrderItem.create({
        sku: 'SKU-1',
        quantity: -1,
        unitPrice: 1,
      });

      expect(zero.isLeft()).toBe(true);
      expect(negative.isLeft()).toBe(true);
    });

    it('returns left with InvalidOrderItemError when unitPrice is negative', () => {
      const result = OrderItem.create({
        sku: 'SKU-1',
        quantity: 1,
        unitPrice: -0.01,
      });

      if (!result.isLeft()) {
        throw new Error('expected left');
      }
      expect(result.value).toBeInstanceOf(InvalidOrderItemError);
    });

    it('assigns distinct orderItemIds to two items with identical sku/quantity/unitPrice', () => {
      const first = OrderItem.create({
        sku: 'SKU-1',
        quantity: 2,
        unitPrice: 5,
      });
      const second = OrderItem.create({
        sku: 'SKU-1',
        quantity: 2,
        unitPrice: 5,
      });

      if (!first.isRight() || !second.isRight()) {
        throw new Error('expected right');
      }
      expect(first.value.orderItemId).not.toBe(second.value.orderItemId);
    });
  });
});
