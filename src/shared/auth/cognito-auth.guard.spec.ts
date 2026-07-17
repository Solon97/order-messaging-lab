import * as crypto from 'crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { findJwkInJwks, type JwkWithKid, type Jwks } from 'aws-jwt-verify/jwk';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { Public } from './public.decorator';

const USER_POOL_ID = 'us-east-1_TESTPOOL123';
const CLIENT_ID = 'expected-client-id';
const ISSUER = `https://cognito-idp.us-east-1.amazonaws.com/${USER_POOL_ID}`;
const KID = 'test-key-1';

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function signRs256(
  header: object,
  payload: object,
  privateKey: crypto.KeyObject,
): string {
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign(
    'RSA-SHA256',
    Buffer.from(signingInput),
    privateKey,
  );
  return `${signingInput}.${base64url(signature)}`;
}

/** A JwksCache backed by a fixed, in-memory JWKS -- no network access. */
function staticJwksCache(jwks: Jwks) {
  return {
    getJwk(_uri: string, decomposedJwt: { header: { kid?: string } }) {
      const jwk = decomposedJwt.header.kid
        ? findJwkInJwks(jwks, decomposedJwt.header.kid)
        : undefined;
      if (!jwk) return Promise.reject(new Error('kid not found in test JWKS'));
      return Promise.resolve(jwk);
    },
    getCachedJwk(_uri: string, decomposedJwt: { header: { kid?: string } }) {
      const jwk = decomposedJwt.header.kid
        ? findJwkInJwks(jwks, decomposedJwt.header.kid)
        : undefined;
      if (!jwk) throw new Error('kid not found in test JWKS');
      return jwk;
    },
    addJwks() {},
    getJwks() {
      return Promise.resolve(jwks);
    },
  };
}

/** A JwksCache that always fails to fetch -- simulates JWKS endpoint being unreachable. */
function failingJwksCache() {
  return {
    getJwk(): Promise<JwkWithKid> {
      return Promise.reject(
        new Error('network error: JWKS endpoint unreachable'),
      );
    },
    getCachedJwk(): JwkWithKid {
      throw new Error('not cached');
    },
    addJwks() {},
    getJwks(): Promise<Jwks> {
      return Promise.reject(
        new Error('network error: JWKS endpoint unreachable'),
      );
    },
  };
}

function createContext(request: unknown): ExecutionContext {
  function handler() {}
  class Controller {}
  return {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('CognitoAuthGuard', () => {
  let keyPair: crypto.KeyPairKeyObjectResult;
  let jwks: Jwks;

  beforeAll(() => {
    keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicJwk = keyPair.publicKey.export({ format: 'jwk' }) as Record<
      string,
      string
    >;
    jwks = {
      keys: [
        { ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' } as JwkWithKid,
      ],
    };
  });

  beforeEach(() => {
    process.env.COGNITO_USER_POOL_ID = USER_POOL_ID;
    process.env.COGNITO_CLIENT_ID = CLIENT_ID;
  });

  afterEach(() => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;
  });

  function validPayload(overrides: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return {
      sub: 'user-123',
      iss: ISSUER,
      token_use: 'access',
      client_id: CLIENT_ID,
      exp: now + 3600,
      iat: now,
      ...overrides,
    };
  }

  function signValid(payloadOverrides: Record<string, unknown> = {}) {
    return signRs256(
      { alg: 'RS256', typ: 'JWT', kid: KID },
      validPayload(payloadOverrides),
      keyPair.privateKey,
    );
  }

  it('returns true without verifying when @Public() metadata is present', async () => {
    class Controller {
      @Public()
      handler() {}
    }
    const context = {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      getHandler: () => Controller.prototype.handler,
      getClass: () => Controller,
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('throws UnauthorizedException when the Authorization header is missing', async () => {
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const context = createContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the header has no Bearer prefix', async () => {
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const context = createContext({
      headers: { authorization: 'Basic somecreds' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the Bearer token is empty', async () => {
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const context = createContext({ headers: { authorization: 'Bearer ' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException for an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signValid({ exp: now - 60, iat: now - 3660 });
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const context = createContext({
      headers: { authorization: `Bearer ${token}` },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException for a token with an invalid signature', async () => {
    const otherKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const token = signRs256(
      { alg: 'RS256', typ: 'JWT', kid: KID },
      validPayload(),
      otherKeyPair.privateKey,
    );
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const context = createContext({
      headers: { authorization: `Bearer ${token}` },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException for a token with a wrong issuer', async () => {
    const token = signValid({
      iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_OTHERPOOL',
    });
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const context = createContext({
      headers: { authorization: `Bearer ${token}` },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException for a token with a wrong client_id (audience)', async () => {
    const token = signValid({ client_id: 'someone-elses-client-id' });
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const context = createContext({
      headers: { authorization: `Bearer ${token}` },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException for a token signed with alg=none', async () => {
    const encodedHeader = base64url(
      JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID }),
    );
    const encodedPayload = base64url(JSON.stringify(validPayload()));
    const token = `${encodedHeader}.${encodedPayload}.`;
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const context = createContext({
      headers: { authorization: `Bearer ${token}` },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException for a token signed with HS256 (unexpected algorithm)', async () => {
    const encodedHeader = base64url(
      JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: KID }),
    );
    const encodedPayload = base64url(JSON.stringify(validPayload()));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createHmac('sha256', 'some-guessed-secret')
      .update(signingInput)
      .digest();
    const token = `${signingInput}.${base64url(signature)}`;
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const context = createContext({
      headers: { authorization: `Bearer ${token}` },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the JWKS fetch fails (fail closed)', async () => {
    const token = signValid();
    const guard = new CognitoAuthGuard(new Reflector(), failingJwksCache());
    const context = createContext({
      headers: { authorization: `Bearer ${token}` },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('sets request.authClientId and returns true for a valid token', async () => {
    const token = signValid();
    const guard = new CognitoAuthGuard(new Reflector(), staticJwksCache(jwks));
    const request = { headers: { authorization: `Bearer ${token}` } };
    const context = createContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as { authClientId?: string }).authClientId).toBe(CLIENT_ID);
  });
});
