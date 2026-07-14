function roundHalfToEvenToCents(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);

  // toFixed(10) resolves binary floating-point noise (e.g. 0.1 -> "0.1000000000")
  // before we inspect the digits past the hundredths place.
  const fixed = abs.toFixed(10);
  const [intPart, fracPart] = fixed.split('.');

  const centsDigits = intPart + fracPart.slice(0, 2);
  let cents = parseInt(centsDigits, 10);

  const remainder = fracPart.slice(2);
  const firstRemainderDigit = parseInt(remainder[0] ?? '0', 10);
  const restRemainder = remainder.slice(1).replace(/0+$/, '');

  if (
    firstRemainderDigit > 5 ||
    (firstRemainderDigit === 5 && restRemainder.length > 0)
  ) {
    cents += 1;
  } else if (firstRemainderDigit === 5 && restRemainder.length === 0) {
    if (cents % 2 !== 0) {
      cents += 1;
    }
  }

  return sign * cents;
}

export class Money {
  private constructor(private readonly cents: number) {}

  static fromNumber(value: number): Money {
    return new Money(roundHalfToEvenToCents(value));
  }

  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  toCents(): number {
    return this.cents;
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  multiply(factor: number): Money {
    return new Money(roundHalfToEvenToCents((this.cents * factor) / 100));
  }

  get amount(): number {
    return this.cents / 100;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }
}
