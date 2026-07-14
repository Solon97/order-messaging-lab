import { Order } from '@/order/domain/entities/order.aggregate';
import { OrderStatus } from '@/order/domain/value-objects/order-status.vo';
import { OrderMapper } from './order.mapper';
import { OrderEntity } from './order.entity';
import { OrderItemEntity } from './order-item.entity';

function buildOrder(): Order {
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
  return result.value;
}

function buildOrderEntity(): OrderEntity {
  const entity = new OrderEntity();
  entity.orderId = 'order-1';
  entity.customerId = 'customer-1';
  entity.status = OrderStatus.CREATED;
  entity.totalAmount = '36.75';
  entity.createdAt = new Date('2026-01-01T00:00:00.000Z');

  const itemEntity = new OrderItemEntity();
  itemEntity.orderItemId = 'item-1';
  itemEntity.orderId = 'order-1';
  itemEntity.sku = 'SKU-1';
  itemEntity.quantity = 2;
  itemEntity.unitPrice = '10.50';
  entity.items = [itemEntity];

  return entity;
}

describe('OrderMapper', () => {
  describe('toEntity', () => {
    it('maps every domain field to the ORM entity, including nested items', () => {
      const order = buildOrder();

      const entity = OrderMapper.toEntity(order);

      expect(entity.orderId).toBe(order.orderId);
      expect(entity.customerId).toBe(order.customerId);
      expect(entity.status).toBe(OrderStatus.CREATED);
      expect(entity.totalAmount).toBe('36.75');
      expect(entity.createdAt).toBe(order.createdAt);
      expect(entity.items).toHaveLength(2);
      expect(entity.items[0]).toMatchObject({
        orderItemId: order.items[0].orderItemId,
        orderId: order.orderId,
        sku: 'SKU-1',
        quantity: 2,
        unitPrice: '10.50',
      });
      expect(entity.items[1]).toMatchObject({
        orderItemId: order.items[1].orderItemId,
        orderId: order.orderId,
        sku: 'SKU-2',
        quantity: 3,
        unitPrice: '5.25',
      });
    });
  });

  describe('toDomain', () => {
    it('maps every ORM entity field to the domain aggregate, including nested items', () => {
      const entity = buildOrderEntity();

      const order = OrderMapper.toDomain(entity);

      expect(order.orderId).toBe('order-1');
      expect(order.customerId).toBe('customer-1');
      expect(order.status).toBe(OrderStatus.CREATED);
      expect(order.totalAmount.amount).toBe(36.75);
      expect(order.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
      expect(order.items).toHaveLength(1);
      expect(order.items[0].orderItemId).toBe('item-1');
      expect(order.items[0].sku).toBe('SKU-1');
      expect(order.items[0].quantity).toBe(2);
      expect(order.items[0].unitPrice.amount).toBe(10.5);
    });
  });

  describe('round-trip', () => {
    it('preserves cent precision through Money -> numeric string -> Money for a fractional-cents-risk value', () => {
      const order = Order.create({
        customerId: 'customer-1',
        items: [{ sku: 'SKU-1', quantity: 3, unitPrice: 0.1 }],
      });
      if (!order.isRight()) {
        throw new Error('expected right');
      }

      const entity = OrderMapper.toEntity(order.value);
      const roundTripped = OrderMapper.toDomain(entity);

      expect(entity.items[0].unitPrice).toBe('0.10');
      expect(roundTripped.totalAmount.amount).toBe(order.value.totalAmount.amount);
      expect(roundTripped.items[0].unitPrice.amount).toBe(
        order.value.items[0].unitPrice.amount,
      );
    });
  });
});
