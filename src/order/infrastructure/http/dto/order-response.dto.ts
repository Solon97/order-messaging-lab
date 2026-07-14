import { Order } from '@/order/domain/entities/order.aggregate';

export class OrderItemResponseDto {
  orderItemId: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export class OrderResponseDto {
  orderId: string;
  customerId: string;
  items: OrderItemResponseDto[];
  status: string;
  totalAmount: number;
  createdAt: Date;

  static fromDomain(order: Order): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.orderId = order.orderId;
    dto.customerId = order.customerId;
    dto.items = order.items.map((item) => ({
      orderItemId: item.orderItemId,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice.amount,
    }));
    dto.status = order.status;
    dto.totalAmount = order.totalAmount.amount;
    dto.createdAt = order.createdAt;
    return dto;
  }
}
