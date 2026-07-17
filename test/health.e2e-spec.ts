import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AppModule as AppModuleType } from '@/app.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;
  let AppModule: typeof AppModuleType;

  beforeAll(() => {
    process.env.PERSISTENCE_PROVIDER = 'IN_MEMORY';
    process.env.AUTH_PROVIDER = 'NONE';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ AppModule } = require('@/app.module') as typeof import('@/app.module'));
  });

  afterAll(() => {
    delete process.env.PERSISTENCE_PROVIDER;
    delete process.env.AUTH_PROVIDER;
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns 200 { status: "ok" } when no DataSource is bound (IN_MEMORY mode)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});
