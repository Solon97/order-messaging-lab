import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { OrderEntity } from './order.entity';
import { OrderItemEntity } from './order-item.entity';

export const typeOrmDataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [OrderEntity, OrderItemEntity],
  migrations: [__dirname + '/migrations/*.{js,ts}'],
  synchronize: false,
};

export const AppDataSource = new DataSource(typeOrmDataSourceOptions);
