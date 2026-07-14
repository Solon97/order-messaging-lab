import { randomUUID } from 'crypto';
import { Either, left, right } from '@/shared/either';
import { Money } from '../value-objects/money.vo';
import { OrderStatus } from '../value-objects/order-status.vo';
import { OrderItem, OrderItemProps } from './order-item.entity';
import { EmptyOrderError } from '../errors/empty-order.error';
import { InvalidOrderItemError } from '../errors/invalid-order-item.error';

export interface CreateOrderProps {
  customerId: string;
  items: OrderItemProps[];
}

export class Order {
  private constructor(
    private readonly _orderId: string,
    private readonly _customerId: string,
    private readonly _items: OrderItem[],
    private readonly _status: OrderStatus,
    private readonly _totalAmount: Money,
    private readonly _createdAt: Date,
  ) {}

  static create(
    props: CreateOrderProps,
  ): Either<EmptyOrderError | InvalidOrderItemError, Order> {
    if (props.items.length === 0) {
      return left(new EmptyOrderError());
    }

    const items: OrderItem[] = [];
    for (const itemProps of props.items) {
      const itemResult = OrderItem.create(itemProps);
      if (itemResult.isLeft()) {
        return left(itemResult.value);
      }
      items.push(itemResult.value);
    }

    const totalAmount = items.reduce(
      (total, item) => total.add(item.unitPrice.multiply(item.quantity)),
      Money.fromNumber(0),
    );

    return right(
      new Order(
        randomUUID(),
        props.customerId,
        items,
        OrderStatus.CREATED,
        totalAmount,
        new Date(),
      ),
    );
  }

  get orderId(): string {
    return this._orderId;
  }

  get customerId(): string {
    return this._customerId;
  }

  get items(): readonly OrderItem[] {
    return this._items;
  }

  get status(): OrderStatus {
    return this._status;
  }

  get totalAmount(): Money {
    return this._totalAmount;
  }

  get createdAt(): Date {
    return this._createdAt;
  }
}
