import { DomainError } from './domain-error';

export class InvalidOrderItemError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
