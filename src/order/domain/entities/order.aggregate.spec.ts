import { Order } from './order.aggregate';
import { OrderStatus } from '../value-objects/order-status.vo';
import { EmptyOrderError } from '../errors/empty-order.error';
import { InvalidOrderItemError } from '../errors/invalid-order-item.error';

describe('Order', () => {
  describe('create', () => {
    it('throws EmptyOrderError when items is empty', () => {
      expect(() =>
        Order.create({ customerId: 'customer-1', items: [] }),
      ).toThrow(EmptyOrderError);
    });

    it('computes totalAmount as the sum of quantity * unitPrice across all items', () => {
      const order = Order.create({
        customerId: 'customer-1',
        items: [
          { sku: 'SKU-1', quantity: 2, unitPrice: 10.5 },
          { sku: 'SKU-2', quantity: 3, unitPrice: 5.25 },
        ],
      });

      // 2 * 10.5 + 3 * 5.25 = 21 + 15.75 = 36.75
      expect(order.totalAmount.amount).toBe(36.75);
    });

    it('builds an OrderItem for each input item, preserving sku and quantity', () => {
      const order = Order.create({
        customerId: 'customer-1',
        items: [
          { sku: 'SKU-1', quantity: 2, unitPrice: 10.5 },
          { sku: 'SKU-2', quantity: 3, unitPrice: 5.25 },
        ],
      });

      expect(order.items).toHaveLength(2);
      expect(order.items[0].sku).toBe('SKU-1');
      expect(order.items[0].quantity).toBe(2);
      expect(order.items[1].sku).toBe('SKU-2');
      expect(order.items[1].quantity).toBe(3);
    });

    it('sets status to CREATED on successful creation', () => {
      const order = Order.create({
        customerId: 'customer-1',
        items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 1 }],
      });

      expect(order.status).toBe(OrderStatus.CREATED);
    });

    it('propagates InvalidOrderItemError when an item has invalid data', () => {
      expect(() =>
        Order.create({
          customerId: 'customer-1',
          items: [{ sku: 'SKU-1', quantity: -1, unitPrice: 1 }],
        }),
      ).toThrow(InvalidOrderItemError);
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

      expect(first.orderId).not.toBe(second.orderId);
    });
  });
});
