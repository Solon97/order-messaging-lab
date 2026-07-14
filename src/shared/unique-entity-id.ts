import { randomUUID } from 'crypto';

export class UniqueEntityId {
  private constructor(private readonly value: string) {}

  static create(): UniqueEntityId {
    return new UniqueEntityId(randomUUID());
  }

  static of(value: string): UniqueEntityId {
    return new UniqueEntityId(value);
  }

  toValue(): string {
    return this.value;
  }

  equals(other: UniqueEntityId): boolean {
    return this.value === other.value;
  }
}
