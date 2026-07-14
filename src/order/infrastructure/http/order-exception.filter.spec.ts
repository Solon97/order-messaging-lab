import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { OrderExceptionFilter } from './order-exception.filter';
import { EmptyOrderError } from '@/order/domain/errors/empty-order.error';

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('OrderExceptionFilter', () => {
  const filter = new OrderExceptionFilter();

  it('maps DomainError to 400 with the error message', () => {
    const { host, status, json } = createHost();
    const error = new EmptyOrderError();

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: error.message }),
    );
  });

  it('passes NotFoundException through as 404', () => {
    const { host, status, json } = createHost();
    const error = new NotFoundException('Order not found');

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(error.getResponse());
  });

  it('maps any other error to 500 with a generic body, no internal details', () => {
    const { host, status, json } = createHost();
    const error = new Error('unexpected db failure with stack details');

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  });
});
