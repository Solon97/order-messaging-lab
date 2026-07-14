import { DomainError } from '@/shared/errors/domain-error';

export class InvalidOrderItemError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
