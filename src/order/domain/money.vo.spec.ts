import { Money } from './money.vo';

describe('Money', () => {
  describe('fromNumber', () => {
    it('normalizes a plain 2-decimal value', () => {
      expect(Money.fromNumber(10.5).amount).toBe(10.5);
    });

    it('avoids classic 0.1 + 0.2 float imprecision when summed', () => {
      const total = Money.fromNumber(0.1).add(Money.fromNumber(0.2));
      expect(total.amount).toBe(0.3);
    });

    it('rounds half-to-even when the discarded digit is exactly 5 and cents is even (rounds down)', () => {
      // 0.125 -> hundredths digit is 2 (even), remainder is exactly "5" -> stays 0.12
      expect(Money.fromNumber(0.125).amount).toBe(0.12);
    });

    it('rounds half-to-even when the discarded digit is exactly 5 and cents is odd (rounds up)', () => {
      // 0.135 -> hundredths digit is 3 (odd), remainder is exactly "5" -> rounds up to 0.14
      expect(Money.fromNumber(0.135).amount).toBe(0.14);
    });

    it('rounds up when the discarded portion is greater than half', () => {
      expect(Money.fromNumber(0.126).amount).toBe(0.13);
    });
  });

  describe('add', () => {
    it('sums two Money instances exactly', () => {
      const result = Money.fromNumber(10.1).add(Money.fromNumber(5.2));
      expect(result.amount).toBe(15.3);
    });
  });

  describe('multiply', () => {
    it('multiplies by an integer factor', () => {
      const result = Money.fromNumber(2.5).multiply(3);
      expect(result.amount).toBe(7.5);
    });
  });

  describe('equals', () => {
    it('returns true for Money instances with the same normalized amount', () => {
      expect(Money.fromNumber(1.1).equals(Money.fromNumber(1.1))).toBe(true);
    });

    it('returns false for Money instances with different amounts', () => {
      expect(Money.fromNumber(1.1).equals(Money.fromNumber(1.2))).toBe(false);
    });
  });
});
