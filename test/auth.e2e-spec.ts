import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AppModule as AppModuleType } from '@/app.module';

describe('Auth wiring (e2e)', () => {
  let app: INestApplication<App>;
  let AppModule: typeof AppModuleType;

  const validPayload = {
    customerId: '11111111-1111-4111-8111-111111111111',
    items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 10 }],
  };

  beforeAll(() => {
    // require (not a static import) so this file's first load of AppModule
    // only happens after these env vars are pinned. AUTH_PROVIDER is left
    // unset on purpose to exercise the spec-defined default (COGNITO) --
    // AUTH-01/AUTH-03. COGNITO_USER_POOL_ID/COGNITO_CLIENT_ID are dummy
    // values sufficient for CognitoAuthGuard to construct its verifier;
    // no real Cognito/JWKS call happens because every request here is
    // unauthenticated and rejected before signature verification is
    // attempted. PERSISTENCE_PROVIDER is pinned to IN_MEMORY (mirroring
    // orders.e2e-spec.ts) so app bootstrap doesn't require a real Postgres
    // connection.
    delete process.env.AUTH_PROVIDER;
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_dummyPool123';
    process.env.COGNITO_CLIENT_ID = 'dummy-client-id';
    process.env.PERSISTENCE_PROVIDER = 'IN_MEMORY';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ AppModule } = require('@/app.module') as typeof import('@/app.module'));
  });

  afterAll(() => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;
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

  it('POST /orders without Authorization header returns 401', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send(validPayload)
      .expect(401);
  });

  it('GET /orders/:id without Authorization header returns 401', async () => {
    await request(app.getHttpServer())
      .get('/orders/22222222-2222-4222-8222-222222222222')
      .expect(401);
  });

  it('GET /health returns 200 (public, unaffected by the guard)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});
