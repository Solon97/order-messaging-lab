import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AppModule as AppModuleType } from '@/app.module';

describe('OrdersController (e2e)', () => {
  let app: INestApplication<App>;
  let AppModule: typeof AppModuleType;

  const validPayload = {
    customerId: '11111111-1111-4111-8111-111111111111',
    items: [
      { sku: 'SKU-1', quantity: 2, unitPrice: 10.5 },
      { sku: 'SKU-2', quantity: 1, unitPrice: 5 },
    ],
  };

  beforeAll(() => {
    // require (not a static import) so this file's first load of AppModule
    // only happens after PERSISTENCE_PROVIDER is pinned to IN_MEMORY, keeping
    // this suite fast and Docker-free regardless of the module's default.
    process.env.PERSISTENCE_PROVIDER = 'IN_MEMORY';
    ({ AppModule } = require('@/app.module') as typeof import('@/app.module'));
  });

  afterAll(() => {
    delete process.env.PERSISTENCE_PROVIDER;
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /orders', () => {
    it('creates the order and returns 201 with total matching the manual sum', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send(validPayload)
        .expect(201);

      expect(response.body.orderId).toEqual(expect.any(String));
      expect(response.body.status).toBe('CREATED');
      expect(response.body.totalAmount).toBe(26);
      expect(response.body.createdAt).toEqual(expect.any(String));
    });

    it('returns 400 and persists nothing when items is empty', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validPayload, items: [] })
        .expect(400);
    });

    it('returns 400 and persists nothing when an item has quantity <= 0', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({
          ...validPayload,
          items: [{ sku: 'SKU-1', quantity: 0, unitPrice: 10 }],
        })
        .expect(400);
    });

    it('returns 400 and persists nothing when an item has unitPrice < 0', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({
          ...validPayload,
          items: [{ sku: 'SKU-1', quantity: 1, unitPrice: -1 }],
        })
        .expect(400);
    });

    it('returns 400 and persists nothing when customerId is missing or not a uuid', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validPayload, customerId: 'not-a-uuid' })
        .expect(400);
    });

    it('returns 400 when an item has an empty sku', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({
          ...validPayload,
          items: [{ sku: '', quantity: 1, unitPrice: 10 }],
        })
        .expect(400);
    });

    it('returns 400 for a malformed JSON body', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Content-Type', 'application/json')
        .send('{not valid json')
        .expect(400);
    });
  });

  describe('GET /orders/:id', () => {
    it('returns 200 with the full order shape for an existing order', async () => {
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

    it('returns 404 for a non-existent order (valid uuid)', async () => {
      await request(app.getHttpServer())
        .get('/orders/22222222-2222-4222-8222-222222222222')
        .expect(404);
    });

    it('returns 400 for an invalid uuid format', async () => {
      await request(app.getHttpServer()).get('/orders/not-a-uuid').expect(400);
    });
  });
});
