import { DomainError } from '@/shared/errors/domain-error';

export class OrderNotFoundError extends DomainError {
  constructor(orderId: string) {
    super(`Order not found: ${orderId}`);
  }
}
