export abstract class Either<L, R> {
  abstract isLeft(): this is Left<L, R>;
  abstract isRight(): this is Right<L, R>;
}

export class Left<L, R> extends Either<L, R> {
  constructor(readonly value: L) {
    super();
  }

  isLeft(): this is Left<L, R> {
    return true;
  }

  isRight(): this is Right<L, R> {
    return false;
  }
}

export class Right<L, R> extends Either<L, R> {
  constructor(readonly value: R) {
    super();
  }

  isLeft(): this is Left<L, R> {
    return false;
  }

  isRight(): this is Right<L, R> {
    return true;
  }
}

export const left = <L, R>(value: L): Either<L, R> => new Left(value);
export const right = <L, R>(value: R): Either<L, R> => new Right(value);
