import { Order } from './order.aggregate';
import { OrderStatus } from '../value-objects/order-status.vo';
import { EmptyOrderError } from '../errors/empty-order.error';
import { InvalidOrderItemError } from '../errors/invalid-order-item.error';

describe('Order', () => {
  describe('create', () => {
    it('returns left with EmptyOrderError when items is empty', () => {
      const result = Order.create({ customerId: 'customer-1', items: [] });

      if (!result.isLeft()) {
        throw new Error('expected left');
      }
      expect(result.value).toBeInstanceOf(EmptyOrderError);
    });

    it('computes totalAmount as the sum of quantity * unitPrice across all items', () => {
      const result = Order.create({
        customerId: 'customer-1',
        items: [
          { sku: 'SKU-1', quantity: 2, unitPrice: 10.5 },
          { sku: 'SKU-2', quantity: 3, unitPrice: 5.25 },
        ],
      });

      if (!result.isRight()) {
        throw new Error('expected right');
      }
      // 2 * 10.5 + 3 * 5.25 = 21 + 15.75 = 36.75
      expect(result.value.totalAmount.amount).toBe(36.75);
    });

    it('builds an OrderItem for each input item, preserving sku and quantity', () => {
      const result = Order.create({
        customerId: 'customer-1',
        items: [
          { sku: 'SKU-1', quantity: 2, unitPrice: 10.5 },
          { sku: 'SKU-2', quantity: 3, unitPrice: 5.25 },
        ],
      });

      if (!result.isRight()) {
        throw new Error('expected right');
      }
      expect(result.value.items).toHaveLength(2);
      expect(result.value.items[0].sku).toBe('SKU-1');
      expect(result.value.items[0].quantity).toBe(2);
      expect(result.value.items[1].sku).toBe('SKU-2');
      expect(result.value.items[1].quantity).toBe(3);
    });

    it('sets status to CREATED on successful creation', () => {
      const result = Order.create({
        customerId: 'customer-1',
        items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 1 }],
      });

      if (!result.isRight()) {
        throw new Error('expected right');
      }
      expect(result.value.status).toBe(OrderStatus.CREATED);
    });

    it('returns left with InvalidOrderItemError when an item has invalid data', () => {
      const result = Order.create({
        customerId: 'customer-1',
        items: [{ sku: 'SKU-1', quantity: -1, unitPrice: 1 }],
      });

      if (!result.isLeft()) {
        throw new Error('expected left');
      }
      expect(result.value).toBeInstanceOf(InvalidOrderItemError);
    });

    it('assigns distinct orderIds across two orders', () => {
      const first = Order.create({
        customerId: 'customer-1',
        items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 1 }],
      });
      const second = Order.create({
        customerId: 'customer-1',
        items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 1 }],
      });

      if (!first.isRight() || !second.isRight()) {
        throw new Error('expected right');
      }
      expect(first.value.orderId).not.toBe(second.value.orderId);
    });
  });
});
