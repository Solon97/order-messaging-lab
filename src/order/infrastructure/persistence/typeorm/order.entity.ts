import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { OrderItemEntity } from './order-item.entity';

@Entity('orders')
export class OrderEntity {
  @PrimaryColumn('uuid')
  orderId: string;

  @Column('uuid')
  customerId: string;

  @Column('varchar')
  status: string;

  @Column('numeric', { precision: 12, scale: 2 })
  totalAmount: string;

  @Column('timestamptz')
  createdAt: Date;

  @OneToMany(() => OrderItemEntity, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItemEntity[];
}
