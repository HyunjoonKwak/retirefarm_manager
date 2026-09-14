import { describe, expect, it } from "vitest";
import {
  MAX_VISIBLE_PAGE_CHARS, VISIBLE_PAGE_PARSER_VERSION, parseVisiblePage,
} from "@/components/reports/competitor/parse-visible-page";

// Text shape observed on 2026-09-14 (brand.naver.com/jbn/products/5618807799) after selecting 중과 2kg.
const OBSERVED = `
(농할) 국내산 대추 방울토마토 토마토 2kg 실중량
16,500원
쿠폰 적용가 16,000원
무료배송
옵션 선택
소과 2kg
중과 2kg (+2,000원)
대과 2kg (+4,400원)
N.대추방울토마토 중과 2kg
삭제
수량
1
18,500원
총 상품금액 18,500원
총 금액
18,500원
`;

describe("parseVisiblePage observed case", () => {
  it("exposes a stable parser version", () => {
    expect(VISIBLE_PAGE_PARSER_VERSION).toBe("visible-page-v1");
    expect(MAX_VISIBLE_PAGE_CHARS).toBe(30000);
  });
  it("prefers the selected total over base and coupon prices", () => {
    const result = parseVisiblePage(OBSERVED);
    expect(result.price).toBe(18500);
    expect(result.shippingFee).toBe(0);
    expect(result.availability).toBe("UNKNOWN");
    expect(result.optionLabel).toBe("N.대추방울토마토 중과 2kg");
    expect(result.hints).toEqual(["쿠폰·포인트 금액은 비교가격에 반영하지 않았습니다."]);
  });
  it("reads a total written inline with a colon or without spaces", () => {
    expect(parseVisiblePage("총 금액: 18,500원\n무료배송").price).toBe(18500);
    expect(parseVisiblePage("총금액18500원\n무료배송").price).toBe(18500);
    expect(parseVisiblePage("총 상품 금액 18,500 원").price).toBe(18500);
  });
});

describe("price ambiguity and non-total prices", () => {
  it("rejects conflicting totals", () => {
    const result = parseVisiblePage("총 상품금액 16,500원\n총 금액 18,500원");
    expect(result.price).toBeNull();
    expect(result.hints).toContain("총 금액이 여러 값(16,500, 18,500원)으로 표시되어 확정하지 않았습니다.");
  });
  it("never lets base, coupon or points prices win when no total is shown", () => {
    const result = parseVisiblePage("16,500원\n쿠폰 적용가 16,000원\n최대 500포인트 적립\n무료배송");
    expect(result.price).toBeNull();
    expect(result.hints).toContain("총 금액 표기를 찾지 못했습니다. 검색 대표가·정상가·쿠폰가는 선택 옵션 가격으로 사용하지 않습니다.");
    expect(result.hints).toContain("쿠폰·포인트 금액은 비교가격에 반영하지 않았습니다.");
  });
  it("does not read an amount from a total label followed by a non-amount line", () => {
    expect(parseVisiblePage("총 금액\n쿠폰 적용가 16,000원").price).toBeNull();
  });
  it("ignores absurd or malformed totals", () => {
    expect(parseVisiblePage("총 금액 999,999,999원").price).toBeNull();
    expect(parseVisiblePage("총 금액 1,85,00원").price).toBeNull();
  });
  it("flags a quantity other than one", () => {
    const result = parseVisiblePage("수량\n2\n총 금액 37,000원");
    expect(result.price).toBeNull();
    expect(result.hints).toContain("수량이 1이 아닌 것으로 보입니다. 총 금액이 수량 1 기준인지 확인하십시오.");
  });
});

describe("shipping", () => {
  it("accepts an exact fixed fee", () => {
    const result = parseVisiblePage("총 금액 18,500원\n배송비 3,000원");
    expect(result.shippingFee).toBe(3000);
  });
  it("accepts 배송비 무료 as zero", () => {
    expect(parseVisiblePage("총 금액 18,500원\n배송비 무료").shippingFee).toBe(0);
  });
  it("returns null for conditional free shipping", () => {
    const result = parseVisiblePage("총 금액 18,500원\n30,000원 이상 구매 시 무료배송\n배송비 3,000원");
    expect(result.shippingFee).toBeNull();
    expect(result.hints.some((h) => h.startsWith("조건부·지역별 배송비 표기가 있어"))).toBe(true);
  });
  it("returns null when region extra shipping is shown", () => {
    const result = parseVisiblePage("총 금액 18,500원\n무료배송\n제주·도서산간 추가 배송비 3,000원");
    expect(result.shippingFee).toBeNull();
  });
  it("returns null for conflicting or missing shipping", () => {
    expect(parseVisiblePage("총 금액 18,500원\n무료배송\n배송비 3,000원").shippingFee).toBeNull();
    const missing = parseVisiblePage("총 금액 18,500원");
    expect(missing.shippingFee).toBeNull();
    expect(missing.hints).toContain("배송비 표기(무료배송 또는 배송비 N원)를 찾지 못했습니다.");
  });
  it("does not read shipping from a title that merely mentions it", () => {
    expect(parseVisiblePage("국내산 토마토 2kg 무료배송 특가\n총 금액 18,500원").shippingFee).toBeNull();
  });
});

describe("availability", () => {
  it("marks explicit product stock-out lines", () => {
    expect(parseVisiblePage("총 금액 18,500원\n품절").availability).toBe("OUT_OF_STOCK");
    expect(parseVisiblePage("일시품절").availability).toBe("OUT_OF_STOCK");
    expect(parseVisiblePage("품절된 상품입니다.").availability).toBe("OUT_OF_STOCK");
    expect(parseVisiblePage("판매 종료").availability).toBe("OUT_OF_STOCK");
  });
  it("keeps UNKNOWN for option-list and review mentions", () => {
    const result = parseVisiblePage("소과 2kg\n대과 2kg (품절)\n지난번엔 품절이라 못 샀는데 이번엔 샀어요\n총 금액 18,500원\n무료배송");
    expect(result.availability).toBe("UNKNOWN");
    expect(result.hints).toContain("옵션 목록·리뷰의 품절 언급은 상품 품절로 간주하지 않았습니다. 재고는 직접 확인하십시오.");
  });
  it("never reports IN_STOCK just because nothing says sold out", () => {
    expect(parseVisiblePage("총 금액 18,500원\n무료배송").availability).toBe("UNKNOWN");
  });
});

describe("option label", () => {
  it("reads an explicit selected-option marker inline or on the next line", () => {
    expect(parseVisiblePage("선택된 옵션: 중과 2kg\n총 금액 18,500원").optionLabel).toBe("중과 2kg");
    expect(parseVisiblePage("선택 옵션\n중과 2kg\n총 금액 18,500원").optionLabel).toBe("중과 2kg");
    expect(parseVisiblePage("선택한 옵션 중과 2kg").optionLabel).toBe("중과 2kg");
  });
  it("does not guess from the option list", () => {
    const result = parseVisiblePage("옵션 선택\n소과 2kg\n중과 2kg (+2,000원)\n대과 2kg (+4,400원)\n총 금액 18,500원");
    expect(result.optionLabel).toBeNull();
    expect(result.hints).toContain("선택 옵션 표기를 찾지 못했습니다. 옵션 목록에서 추정하지 않습니다.");
  });
  it("rejects list-style, amount-only and quantity candidates even in a selected row", () => {
    expect(parseVisiblePage("중과 2kg (+2,000원)\n삭제").optionLabel).toBeNull();
    expect(parseVisiblePage("18,500원\n삭제").optionLabel).toBeNull();
    expect(parseVisiblePage("수량 1\n삭제").optionLabel).toBeNull();
  });
  it("returns null when several different options are marked as selected", () => {
    const result = parseVisiblePage("소과 2kg\n삭제\n중과 2kg\n삭제\n총 금액 33,000원");
    expect(result.optionLabel).toBeNull();
    expect(result.hints).toContain("선택 옵션 표기가 여러 개라 확정하지 않았습니다.");
  });
});

describe("input limits", () => {
  it("returns nulls and a warning for oversized text without parsing it", () => {
    const oversized = `총 금액 18,500원\n무료배송\n${"x".repeat(MAX_VISIBLE_PAGE_CHARS)}`;
    expect(parseVisiblePage(oversized)).toEqual({
      price: null, shippingFee: null, availability: "UNKNOWN", optionLabel: null,
      hints: ["입력이 30,000자를 초과해 해석하지 않았습니다."],
    });
  });
  it("parses text exactly at the limit", () => {
    const head = "총 금액 18,500원\n무료배송\n";
    const atLimit = head + "x".repeat(MAX_VISIBLE_PAGE_CHARS - head.length);
    expect(atLimit.length).toBe(MAX_VISIBLE_PAGE_CHARS);
    expect(parseVisiblePage(atLimit).price).toBe(18500);
  });
  it("handles empty, whitespace-only and non-string input safely", () => {
    expect(parseVisiblePage("").hints).toEqual(["붙여넣은 텍스트가 비어 있습니다."]);
    expect(parseVisiblePage("  \n\t\n").price).toBeNull();
    expect(parseVisiblePage(undefined as unknown as string).hints).toEqual(["붙여넣은 텍스트가 문자열이 아닙니다."]);
  });
  it("normalizes Windows line endings and inner whitespace", () => {
    const result = parseVisiblePage("총   금액\r\n18,500원\r\n무료 배송\r\n");
    expect(result.price).toBe(18500);
    expect(result.shippingFee).toBe(0);
  });
});


it("does not treat a separate conditional shipping line as free", () => {
  expect(parseVisiblePage("무료배송\n30,000원 이상 무료").shippingFee).toBeNull();
  expect(parseVisiblePage("배송비 3,000원\n제주 추가 비용 2,000원").shippingFee).toBeNull();
});
