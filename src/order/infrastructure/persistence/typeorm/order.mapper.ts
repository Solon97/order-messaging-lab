import { Order } from '@/order/domain/entities/order.aggregate';
import { OrderItem } from '@/order/domain/entities/order-item.entity';
import { Money } from '@/order/domain/value-objects/money.vo';
import { OrderStatus } from '@/order/domain/value-objects/order-status.vo';
import { OrderEntity } from './order.entity';
import { OrderItemEntity } from './order-item.entity';

/** Converts integer cents to a `numeric(12,2)`-compatible string, without float division. */
function centsToNumeric(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absCents = Math.abs(cents);
  const integerPart = Math.floor(absCents / 100);
  const fractionPart = (absCents % 100).toString().padStart(2, '0');
  return `${sign}${integerPart}.${fractionPart}`;
}

/** Converts a `numeric(12,2)` string (as returned by TypeORM/pg) to integer cents, without float parsing. */
function numericToCents(value: string): number {
  const sign = value.startsWith('-') ? -1 : 1;
  const [integerPart, fractionPart = ''] = value.replace('-', '').split('.');
  const cents = parseInt(integerPart + fractionPart.padEnd(2, '0').slice(0, 2), 10);
  return sign * cents;
}

function moneyToNumeric(money: Money): string {
  return centsToNumeric(money.toCents());
}

function numericToMoney(value: string): Money {
  return Money.fromCents(numericToCents(value));
}

export class OrderMapper {
  static toEntity(order: Order): OrderEntity {
    const entity = new OrderEntity();
    entity.orderId = order.orderId;
    entity.customerId = order.customerId;
    entity.status = order.status;
    entity.totalAmount = moneyToNumeric(order.totalAmount);
    entity.createdAt = order.createdAt;
    entity.items = order.items.map((item) => {
      const itemEntity = new OrderItemEntity();
      itemEntity.orderItemId = item.orderItemId;
      itemEntity.orderId = order.orderId;
      itemEntity.sku = item.sku;
      itemEntity.quantity = item.quantity;
      itemEntity.unitPrice = moneyToNumeric(item.unitPrice);
      return itemEntity;
    });
    return entity;
  }

  static toDomain(entity: OrderEntity): Order {
    const items = entity.items.map((itemEntity) =>
      OrderItem.reconstitute({
        orderItemId: itemEntity.orderItemId,
        sku: itemEntity.sku,
        quantity: itemEntity.quantity,
        unitPrice: numericToMoney(itemEntity.unitPrice),
      }),
    );

    return Order.reconstitute({
      orderId: entity.orderId,
      customerId: entity.customerId,
      items,
      status: entity.status as OrderStatus,
      totalAmount: numericToMoney(entity.totalAmount),
      createdAt: entity.createdAt,
    });
  }
}
