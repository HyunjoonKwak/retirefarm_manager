/**
 * 금액(원) 집계 유틸리티.
 *
 * DB의 Decimal 컬럼을 `BigInt(x.toString())`로 바꾸면 소수 금액(예: 1500000.5)에서
 * SyntaxError가 나서 요약/보고서 전체가 500이 된다. 집계는 Prisma.Decimal로 하고,
 * 신규 입력은 validations/money.ts에서 정수(원 단위)만 받는다.
 * 기존 소수 데이터는 임의로 반올림하지 않고 그대로 합산한다.
 */
import { Prisma } from "@prisma/client";

export type Decimal = Prisma.Decimal;
export type DecimalLike = Prisma.Decimal | number | string | bigint | null | undefined;

export const ZERO: Prisma.Decimal = new Prisma.Decimal(0);

export function toDecimal(value: DecimalLike): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return ZERO;
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === "bigint") return new Prisma.Decimal(value.toString());
  return new Prisma.Decimal(value);
}

export function sumDecimals(values: Iterable<DecimalLike>): Prisma.Decimal {
  let total = ZERO;
  for (const value of values) {
    total = total.plus(toDecimal(value));
  }
  return total;
}

/** 지수 표기 없이 고정 소수점 문자열로 직렬화한다 (API 응답용). */
export function decimalToString(value: DecimalLike): string {
  return toDecimal(value).toFixed();
}

export function decimalToNumber(value: DecimalLike): number {
  return toDecimal(value).toNumber();
}

/**
 * part / whole × 100. whole이 0 이하이면 0.
 * 소수 자릿수는 decimals로 반올림(반올림 방식: HALF_UP).
 */
export function percentOf(part: DecimalLike, whole: DecimalLike, decimals: number = 0): number {
  const denominator = toDecimal(whole);
  if (denominator.lte(0)) return 0;
  return toDecimal(part)
    .mul(100)
    .div(denominator)
    .toDecimalPlaces(decimals, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** a > b 이면 양수, 같으면 0, 작으면 음수 (정렬 비교자용). */
export function compareDecimal(a: DecimalLike, b: DecimalLike): number {
  return toDecimal(a).comparedTo(toDecimal(b));
}
