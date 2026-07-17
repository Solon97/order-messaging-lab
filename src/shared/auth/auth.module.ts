import { CanActivate, Global, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { NoopAuthGuard } from './noop-auth.guard';

export function createAuthGuard(): CanActivate {
  const provider = process.env.AUTH_PROVIDER ?? 'COGNITO';
  switch (provider) {
    case 'NONE':
      return new NoopAuthGuard();
    case 'COGNITO':
      return new CognitoAuthGuard(new Reflector());
    default:
      throw new Error(`Unsupported AUTH_PROVIDER: ${provider}`);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useFactory: createAuthGuard,
    },
  ],
})
export class AuthModule {}
