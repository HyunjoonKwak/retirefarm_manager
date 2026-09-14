// Pure client-side parser for product page text a person copied from a visible Naver
// store page after selecting an option. No network, no AI, no hidden DOM data: only the
// pasted text is read. Every value is conservative — when the text is ambiguous the
// field becomes null/UNKNOWN and a Korean hint explains why, so the operator can confirm
// or correct the values in the record form before saving.

export const VISIBLE_PAGE_PARSER_VERSION = "visible-page-v2";
export const MAX_VISIBLE_PAGE_CHARS = 30000;
const MAX_AMOUNT = 10_000_000;

export type VisibleAvailability = "OUT_OF_STOCK" | "UNKNOWN";

export interface VisiblePageParse {
  price: number | null;
  shippingFee: number | null;
  availability: VisibleAvailability;
  optionLabel: string | null;
  hints: string[];
}

const EMPTY: VisiblePageParse = { price: null, shippingFee: null, availability: "UNKNOWN", optionLabel: null, hints: [] };

const AMOUNT = "(\\d{1,3}(?:,\\d{3})+|\\d+)\\s*원";
const TOTAL_LABEL = /^총\s*(?:상품\s*)?금액\s*[:：]?\s*/;
const TOTAL_WITH_AMOUNT = new RegExp(`^총\\s*(?:상품\\s*)?금액\\s*(?:도움말\\s*)?[:：]?\\s*${AMOUNT}$`);
const ONLY_AMOUNT = new RegExp(`^${AMOUNT}$`);
const ANY_AMOUNT = new RegExp(AMOUNT);
const COUPON_LINE = /쿠폰|포인트|적립/;
const SHIPPING_FREE = /^(?:무료\s*배송|배송비\s*[:：]?\s*무료)$/;
const SHIPPING_FIXED = new RegExp(`^배송비\\s*[:：]?\\s*${AMOUNT}$`);
const SHIPPING_CONDITIONAL = /조건부|이상\s*(?:구매\s*시\s*)?무료|도서\s*산간|제주|지역별|추가\s*배송비|추가\s*비용|착불/;
const SHIPPING_MENTION = /배송비|무료\s*배송/;
const OUT_OF_STOCK_LINE = /^(?:일시\s*)?품절(?:된\s*상품입니다)?\.?$|^판매\s*종료(?:된\s*상품입니다)?\.?$/;
const OUT_OF_STOCK_MENTION = /품절|판매\s*종료/;
const OPTION_MARKER = /^선택(?:된|한)?\s*옵션\s*[:：]?\s*/;
const OPTION_DELETE_LINE = /^(?:옵션\s*)?삭제$/;
const OPTION_LIST_ITEM = /\([+\-]\s*[\d,]+\s*원\)/;
const QUANTITY_LINE = /^수량\s*[:：]?\s*(\d+)$/;

const toAmount = (raw: string): number | null => {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isInteger(value) && value >= 0 && value <= MAX_AMOUNT ? value : null;
};

const unique = <T,>(values: readonly T[]): T[] => [...new Set(values)];

const normalizeLines = (text: string): string[] =>
  text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length > 0);

// Amount on the label line, or on the very next line when the label stands alone.
const amountAfterLabel = (lines: readonly string[], index: number, label: RegExp, inline: RegExp): number | null => {
  const inlineMatch = lines[index].match(inline);
  if (inlineMatch) return toAmount(inlineMatch[1]);
  if (!label.test(lines[index]) || lines[index].replace(label, "").length > 0) return null;
  const amountIndex = lines[index + 1] === "도움말" ? index + 2 : index + 1;
  const next = lines[amountIndex]?.match(ONLY_AMOUNT);
  return next ? toAmount(next[1]) : null;
};

const parsePrice = (lines: readonly string[]): Pick<VisiblePageParse, "price" | "hints"> => {
  const totals = unique(
    lines.map((_, i) => amountAfterLabel(lines, i, TOTAL_LABEL, TOTAL_WITH_AMOUNT)).filter((v): v is number => v !== null),
  );
  const couponHints = lines.some((line) => COUPON_LINE.test(line) && ANY_AMOUNT.test(line))
    ? ["쿠폰·포인트 금액은 비교가격에 반영하지 않았습니다."]
    : [];
  if (totals.length === 1) return { price: totals[0], hints: couponHints };
  if (totals.length > 1) {
    return { price: null, hints: [`총 금액이 여러 값(${totals.map((v) => v.toLocaleString("ko-KR")).join(", ")}원)으로 표시되어 확정하지 않았습니다.`, ...couponHints] };
  }
  const hasOtherAmount = lines.some((line) => ANY_AMOUNT.test(line));
  return {
    price: null,
    hints: [
      hasOtherAmount
        ? "총 금액 표기를 찾지 못했습니다. 검색 대표가·정상가·쿠폰가는 선택 옵션 가격으로 사용하지 않습니다."
        : "총 금액 표기를 찾지 못했습니다. 옵션을 선택한 뒤 화면 텍스트를 다시 붙여넣으십시오.",
      ...couponHints,
    ],
  };
};

const shippingFeeOf = (line: string): number | null => {
  if (SHIPPING_FREE.test(line)) return 0;
  const fixed = line.match(SHIPPING_FIXED);
  return fixed ? toAmount(fixed[1]) : null;
};

const parseShipping = (lines: readonly string[]): Pick<VisiblePageParse, "shippingFee" | "hints"> => {
  const conditional = lines.filter((line, i) => SHIPPING_CONDITIONAL.test(line) && (SHIPPING_MENTION.test(line) || SHIPPING_MENTION.test(lines[i - 1] ?? "") || SHIPPING_MENTION.test(lines[i + 1] ?? "")));
  if (conditional.length > 0) {
    return { shippingFee: null, hints: [`조건부·지역별 배송비 표기가 있어 배송비를 확정하지 않았습니다: "${conditional[0]}"`] };
  }
  const fees = unique(lines.map(shippingFeeOf).filter((v): v is number => v !== null));
  if (fees.length === 1) return { shippingFee: fees[0], hints: [] };
  if (fees.length > 1) return { shippingFee: null, hints: ["배송비가 여러 값으로 표시되어 확정하지 않았습니다."] };
  return { shippingFee: null, hints: ["배송비 표기(무료배송 또는 배송비 N원)를 찾지 못했습니다."] };
};

const parseAvailability = (lines: readonly string[]): Pick<VisiblePageParse, "availability" | "hints"> => {
  if (lines.some((line) => OUT_OF_STOCK_LINE.test(line))) return { availability: "OUT_OF_STOCK", hints: [] };
  const mentioned = lines.some((line) => OUT_OF_STOCK_MENTION.test(line));
  return {
    availability: "UNKNOWN",
    hints: mentioned ? ["옵션 목록·리뷰의 품절 언급은 상품 품절로 간주하지 않았습니다. 재고는 직접 확인하십시오."] : [],
  };
};

const optionCandidateAt = (lines: readonly string[], index: number): string | null => {
  const line = lines[index];
  if (OPTION_MARKER.test(line)) {
    const inline = line.replace(OPTION_MARKER, "");
    return inline.length > 0 ? inline : (lines[index + 1] ?? null);
  }
  if (line === "상품명" && ONLY_AMOUNT.test(lines[index + 2] ?? "")) return lines[index + 1] ?? null;
  const next = lines[index + 1];
  return next !== undefined && OPTION_DELETE_LINE.test(next) && !OPTION_DELETE_LINE.test(line) ? line : null;
};

const parseOption = (lines: readonly string[]): Pick<VisiblePageParse, "optionLabel" | "hints"> => {
  const candidates = unique(
    lines
      .map((_, i) => optionCandidateAt(lines, i))
      .filter((v): v is string => v !== null && !OPTION_LIST_ITEM.test(v) && !ONLY_AMOUNT.test(v) && !QUANTITY_LINE.test(v)),
  );
  if (candidates.length === 1) return { optionLabel: candidates[0], hints: [] };
  if (candidates.length > 1) return { optionLabel: null, hints: ["선택 옵션 표기가 여러 개라 확정하지 않았습니다."] };
  return { optionLabel: null, hints: ["선택 옵션 표기를 찾지 못했습니다. 옵션 목록에서 추정하지 않습니다."] };
};

// "수량 2" inline, or a bare "수량" label followed by a digits-only line.
const quantityAt = (lines: readonly string[], index: number): string | undefined => {
  const inline = lines[index].match(QUANTITY_LINE)?.[1] ?? lines[index].match(/^총\s*(\d+)\s*개$/)?.[1];
  if (inline !== undefined) return inline;
  return lines[index] === "수량" && /^\d+$/.test(lines[index + 1] ?? "") ? lines[index + 1] : undefined;
};

const quantityHints = (lines: readonly string[]): string[] => {
  const quantities = unique(lines.map((_, i) => quantityAt(lines, i)).filter((v): v is string => v !== undefined));
  return quantities.some((q) => q !== "1") ? ["수량이 1이 아닌 것으로 보입니다. 총 금액이 수량 1 기준인지 확인하십시오."] : [];
};

export function parseVisiblePage(text: string): VisiblePageParse {
  if (typeof text !== "string") return { ...EMPTY, hints: ["붙여넣은 텍스트가 문자열이 아닙니다."] };
  if (text.length > MAX_VISIBLE_PAGE_CHARS) {
    return { ...EMPTY, hints: [`입력이 ${MAX_VISIBLE_PAGE_CHARS.toLocaleString("ko-KR")}자를 초과해 해석하지 않았습니다.`] };
  }
  const lines = normalizeLines(text);
  if (lines.length === 0) return { ...EMPTY, hints: ["붙여넣은 텍스트가 비어 있습니다."] };

  const price = parsePrice(lines);
  const shipping = parseShipping(lines);
  const availability = parseAvailability(lines);
  const option = parseOption(lines);
  const quantityWarnings = quantityHints(lines);
  return {
    price: quantityWarnings.length ? null : price.price,
    shippingFee: shipping.shippingFee,
    availability: availability.availability,
    optionLabel: option.optionLabel,
    hints: [...price.hints, ...shipping.hints, ...availability.hints, ...option.hints, ...quantityWarnings],
  };
}
