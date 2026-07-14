import { Either, left, right } from '@/shared/either';
import { UniqueEntityId } from '@/shared/unique-entity-id/unique-entity-id';
import { Money } from '../value-objects/money.vo';
import { InvalidOrderItemError } from '../errors/invalid-order-item.error';

export interface OrderItemProps {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderItemPersistedProps {
  orderItemId: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
}

export class OrderItem {
  private constructor(
    private readonly _orderItemId: UniqueEntityId,
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
      return left(new InvalidOrderItemError('unitPrice must not be negative'));
    }

    return right(
      new OrderItem(
        UniqueEntityId.create(),
        props.sku,
        props.quantity,
        Money.fromNumber(props.unitPrice),
      ),
    );
  }

  /** Rebuilds an already-valid OrderItem from persisted data, bypassing creation validation. */
  static reconstitute(props: OrderItemPersistedProps): OrderItem {
    return new OrderItem(
      UniqueEntityId.of(props.orderItemId),
      props.sku,
      props.quantity,
      props.unitPrice,
    );
  }

  get orderItemId(): string {
    return this._orderItemId.toValue();
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
