import { ExecutionContext } from '@nestjs/common';
import { NoopAuthGuard } from './noop-auth.guard';

describe('NoopAuthGuard', () => {
  it('canActivate returns true for an arbitrary ExecutionContext', () => {
    const guard = new NoopAuthGuard();
    const context = {} as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
