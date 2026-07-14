import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AppModule as AppModuleType } from '@/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let AppModule: typeof AppModuleType;

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
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});
