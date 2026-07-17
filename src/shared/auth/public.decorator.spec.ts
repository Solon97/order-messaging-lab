import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, Public } from './public.decorator';

describe('Public decorator', () => {
  it('attaches the isPublic metadata with value true on a handler', () => {
    class TestController {
      @Public()
      handler() {
        return undefined;
      }
    }

    const reflector = new Reflector();
    const metadata = reflector.get<boolean>(
      IS_PUBLIC_KEY,
      TestController.prototype.handler,
    );

    expect(metadata).toBe(true);
  });

  it('attaches the isPublic metadata with value true on a class', () => {
    @Public()
    class TestController {}

    const reflector = new Reflector();
    const metadata = reflector.get<boolean>(IS_PUBLIC_KEY, TestController);

    expect(metadata).toBe(true);
  });
});
