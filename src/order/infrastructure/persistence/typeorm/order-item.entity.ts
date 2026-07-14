import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { OrderEntity } from './order.entity';

@Entity('order_items')
export class OrderItemEntity {
  @PrimaryColumn('uuid')
  orderItemId: string;

  @Column('uuid')
  orderId: string;

  @Column('varchar')
  sku: string;

  @Column('int')
  quantity: number;

  @Column('numeric', { precision: 12, scale: 2 })
  unitPrice: string;

  @ManyToOne(() => OrderEntity, (order) => order.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order: OrderEntity;
}
