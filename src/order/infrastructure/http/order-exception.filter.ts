import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '@/shared/errors/domain-error';

@Catch()
export class OrderExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof NotFoundException) {
      response.status(HttpStatus.NOT_FOUND).json(exception.getResponse());
      return;
    }

    if (exception instanceof DomainError) {
      response
        .status(HttpStatus.BAD_REQUEST)
        .json({ statusCode: HttpStatus.BAD_REQUEST, message: exception.message });
      return;
    }

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
  }
}
