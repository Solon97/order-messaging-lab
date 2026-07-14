import { DomainError } from '@/shared/errors/domain-error';

export class EmptyOrderError extends DomainError {
  constructor() {
    super('Order must contain at least one item');
  }
}
