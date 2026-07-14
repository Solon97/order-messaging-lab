import { ApiProperty } from '@nestjs/swagger';
import { Order } from '@/order/domain/entities/order.aggregate';

export class OrderItemResponseDto {
  @ApiProperty()
  orderItemId: string;
  @ApiProperty()
  sku: string;
  @ApiProperty()
  quantity: number;
  @ApiProperty()
  unitPrice: number;
}

export class OrderResponseDto {
  @ApiProperty()
  orderId: string;
  @ApiProperty()
  customerId: string;
  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];
  @ApiProperty()
  status: string;
  @ApiProperty()
  totalAmount: number;
  @ApiProperty()
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
