import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { OrderEntity } from './order.entity';
import { OrderItemEntity } from './order-item.entity';

export const typeOrmDataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // RDS instances enforce rds.force_ssl by default, rejecting plaintext
  // connections with a pg_hba.conf error; local/testcontainers Postgres
  // doesn't, so this is opt-in via env rather than always-on.
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [OrderEntity, OrderItemEntity],
  migrations: [__dirname + '/migrations/*.{js,ts}'],
  synchronize: false,
};

export const AppDataSource = new DataSource(typeOrmDataSourceOptions);
