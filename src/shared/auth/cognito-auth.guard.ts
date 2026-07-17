import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { JwksCache } from 'aws-jwt-verify/jwk';
import { IS_PUBLIC_KEY } from './public.decorator';

interface RequestWithAuth {
  headers?: { authorization?: string };
  authClientId?: string;
}

function createVerifier(jwksCache?: JwksCache) {
  return CognitoJwtVerifier.create(
    {
      userPoolId: process.env.COGNITO_USER_POOL_ID as string,
      tokenUse: 'access' as const,
      clientId: process.env.COGNITO_CLIENT_ID as string,
    },
    jwksCache ? { jwksCache } : undefined,
  );
}

@Injectable()
export class CognitoAuthGuard implements CanActivate {
  private readonly verifier: ReturnType<typeof createVerifier>;

  constructor(
    private readonly reflector: Reflector,
    jwksCache?: JwksCache,
  ) {
    this.verifier = createVerifier(jwksCache);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const authHeader = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice('Bearer '.length);
    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: { client_id?: string };
    try {
      payload = await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException();
    }

    request.authClientId = payload.client_id;
    return true;
  }
}
