import { describe, it, expect } from "vitest";
import { krwAmountSchema, KRW_INTEGER_MESSAGE } from "@/lib/validations/money";

describe("krwAmountSchema", () => {
  it("정수 금액은 통과한다", () => {
    expect(krwAmountSchema().parse(1500000)).toBe(1500000);
    expect(krwAmountSchema().parse(0)).toBe(0);
  });

  it("소수 금액은 원 단위 정수 메시지로 거부한다", () => {
    const result = krwAmountSchema().safeParse(1500000.5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(KRW_INTEGER_MESSAGE);
    }
  });

  it("min 옵션을 적용한다", () => {
    expect(krwAmountSchema({ min: 1 }).safeParse(0).success).toBe(false);
    expect(krwAmountSchema({ min: 1 }).safeParse(1).success).toBe(true);
  });
});
