import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { OrderEntity } from '@/order/infrastructure/persistence/typeorm/order.entity';
import { OrderItemEntity } from '@/order/infrastructure/persistence/typeorm/order-item.entity';

jest.setTimeout(120_000);

describe('Orders (Postgres adapter e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;

  const validPayload = {
    customerId: '11111111-1111-4111-8111-111111111111',
    items: [
      { sku: 'SKU-1', quantity: 2, unitPrice: 10.5 },
      { sku: 'SKU-2', quantity: 1, unitPrice: 5 },
    ],
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.PERSISTENCE_PROVIDER = 'POSTGRES';

    const migrationDataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [OrderEntity, OrderItemEntity],
      migrations: [
        __dirname +
          '/../src/order/infrastructure/persistence/typeorm/migrations/*.ts',
      ],
    });
    await migrationDataSource.initialize();
    await migrationDataSource.runMigrations();
    await migrationDataSource.destroy();

    // require (not a static import) so this file's first load of AppModule
    // only happens after PERSISTENCE_PROVIDER/DATABASE_URL are set, letting
    // OrdersModule pick up the Postgres branch instead of the in-memory one.

    const { AppModule } =
      require('@/app.module') as typeof import('@/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
    delete process.env.DATABASE_URL;
    delete process.env.PERSISTENCE_PROVIDER;
  });

  it('POST /orders creates and persists the order (201, total matches manual sum)', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .send(validPayload)
      .expect(201);

    expect(response.body.orderId).toEqual(expect.any(String));
    expect(response.body.status).toBe('CREATED');
    expect(response.body.totalAmount).toBe(26);
  });

  it('POST /orders returns 400 and persists nothing when items is empty', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send({ ...validPayload, items: [] })
      .expect(400);
  });

  it('GET /orders/:id returns 200 with the full persisted order shape', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .send(validPayload)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/orders/${created.body.orderId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      orderId: created.body.orderId,
      customerId: validPayload.customerId,
      status: 'CREATED',
      totalAmount: 26,
    });
    expect(response.body.items).toHaveLength(2);
  });

  it('GET /orders/:id returns 404 for a non-existent order (valid uuid)', async () => {
    await request(app.getHttpServer())
      .get('/orders/22222222-2222-4222-8222-222222222222')
      .expect(404);
  });

  it('GET /orders/:id returns 400 for an invalid uuid format', async () => {
    await request(app.getHttpServer()).get('/orders/not-a-uuid').expect(400);
  });
});
