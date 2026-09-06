import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  toDecimal,
  sumDecimals,
  decimalToString,
  percentOf,
  compareDecimal,
} from "@/lib/utils/money";

describe("money utils", () => {
  it("소수 Decimal을 예외 없이 합산한다 (BigInt 변환 대체)", () => {
    const values = [new Prisma.Decimal("1500000.5"), "2500000", 1000, null, undefined, BigInt(5)];
    expect(() => BigInt("1500000.5")).toThrow();
    expect(decimalToString(sumDecimals(values))).toBe("4001005.5");
  });

  it("빈 값은 0으로 본다", () => {
    expect(toDecimal(null).toNumber()).toBe(0);
    expect(toDecimal("").toNumber()).toBe(0);
    expect(sumDecimals([]).toNumber()).toBe(0);
  });

  it("큰 금액도 지수 표기 없이 직렬화한다", () => {
    expect(decimalToString("123456789012345678901234")).toBe("123456789012345678901234");
  });

  it("percentOf는 분모가 0 이하이면 0, 아니면 반올림한다", () => {
    expect(percentOf(50, 0)).toBe(0);
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(1, 3, 2)).toBe(33.33);
    expect(percentOf(150, 100)).toBe(150);
  });

  it("compareDecimal은 정렬 비교자로 쓸 수 있다", () => {
    const sorted = ["10", "2.5", "7"].sort((a, b) => compareDecimal(b, a));
    expect(sorted).toEqual(["10", "7", "2.5"]);
  });
});
