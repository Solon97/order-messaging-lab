import { Either, left, right } from '@/shared/either';
import { UniqueEntityId } from '@/shared/unique-entity-id/unique-entity-id';
import { Money } from '../value-objects/money.vo';
import { OrderStatus } from '../value-objects/order-status.vo';
import { OrderItem, OrderItemProps } from './order-item.entity';
import { EmptyOrderError } from '../errors/empty-order.error';
import { InvalidOrderItemError } from '../errors/invalid-order-item.error';

export interface CreateOrderProps {
  customerId: string;
  items: OrderItemProps[];
}

export interface OrderPersistedProps {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: Money;
  createdAt: Date;
}

export class Order {
  private constructor(
    private readonly _orderId: UniqueEntityId,
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
        UniqueEntityId.create(),
        props.customerId,
        items,
        OrderStatus.CREATED,
        totalAmount,
        new Date(),
      ),
    );
  }

  /** Rebuilds an already-valid Order from persisted data, bypassing creation validation. */
  static reconstitute(props: OrderPersistedProps): Order {
    return new Order(
      UniqueEntityId.of(props.orderId),
      props.customerId,
      props.items,
      props.status,
      props.totalAmount,
      props.createdAt,
    );
  }

  get orderId(): string {
    return this._orderId.toValue();
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
