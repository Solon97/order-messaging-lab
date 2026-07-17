import { createAuthGuard } from './auth.module';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { NoopAuthGuard } from './noop-auth.guard';

describe('createAuthGuard (AuthModule APP_GUARD factory)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL123';
    process.env.COGNITO_CLIENT_ID = 'some-client-id';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('resolves to NoopAuthGuard when AUTH_PROVIDER=NONE', () => {
    process.env.AUTH_PROVIDER = 'NONE';

    expect(createAuthGuard()).toBeInstanceOf(NoopAuthGuard);
  });

  it('resolves to CognitoAuthGuard when AUTH_PROVIDER=COGNITO', () => {
    process.env.AUTH_PROVIDER = 'COGNITO';

    expect(createAuthGuard()).toBeInstanceOf(CognitoAuthGuard);
  });

  it('resolves to CognitoAuthGuard when AUTH_PROVIDER is unset (default)', () => {
    delete process.env.AUTH_PROVIDER;

    expect(createAuthGuard()).toBeInstanceOf(CognitoAuthGuard);
  });

  it('throws for an unsupported AUTH_PROVIDER value', () => {
    process.env.AUTH_PROVIDER = 'INVALID';

    expect(() => createAuthGuard()).toThrow(
      'Unsupported AUTH_PROVIDER: INVALID',
    );
  });
});
