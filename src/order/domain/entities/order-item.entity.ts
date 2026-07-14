import { randomUUID } from 'crypto';
import { Either, left, right } from '@/shared/either';
import { Money } from '../value-objects/money.vo';
import { InvalidOrderItemError } from '../errors/invalid-order-item.error';

export interface OrderItemProps {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export class OrderItem {
  private constructor(
    private readonly _orderItemId: string,
    private readonly _sku: string,
    private readonly _quantity: number,
    private readonly _unitPrice: Money,
  ) {}

  static create(
    props: OrderItemProps,
  ): Either<InvalidOrderItemError, OrderItem> {
    if (!props.sku || props.sku.trim().length === 0) {
      return left(new InvalidOrderItemError('sku must not be empty'));
    }
    if (props.quantity <= 0) {
      return left(
        new InvalidOrderItemError('quantity must be greater than zero'),
      );
    }
    if (props.unitPrice < 0) {
      return left(
        new InvalidOrderItemError('unitPrice must not be negative'),
      );
    }

    return right(
      new OrderItem(
        randomUUID(),
        props.sku,
        props.quantity,
        Money.fromNumber(props.unitPrice),
      ),
    );
  }

  get orderItemId(): string {
    return this._orderItemId;
  }

  get sku(): string {
    return this._sku;
  }

  get quantity(): number {
    return this._quantity;
  }

  get unitPrice(): Money {
    return this._unitPrice;
  }
}
