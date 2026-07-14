import { UniqueEntityId } from './unique-entity-id';

describe('UniqueEntityId', () => {
  describe('create', () => {
    it('generates distinct ids across two instances', () => {
      const first = UniqueEntityId.create();
      const second = UniqueEntityId.create();

      expect(first.toValue()).not.toBe(second.toValue());
    });
  });

  describe('of', () => {
    it('wraps a given value without generating a new one', () => {
      const id = UniqueEntityId.of('existing-id');

      expect(id.toValue()).toBe('existing-id');
    });
  });

  describe('equals', () => {
    it('returns true for two instances wrapping the same value', () => {
      const a = UniqueEntityId.of('same-id');
      const b = UniqueEntityId.of('same-id');

      expect(a.equals(b)).toBe(true);
    });

    it('returns false for instances wrapping different values', () => {
      const a = UniqueEntityId.of('id-a');
      const b = UniqueEntityId.of('id-b');

      expect(a.equals(b)).toBe(false);
    });
  });
});
