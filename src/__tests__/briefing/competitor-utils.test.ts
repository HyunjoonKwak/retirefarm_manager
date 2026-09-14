import { describe, expect, it } from "vitest";
import {
  deliveredPrice, describeSearchError, fromDatetimeLocal, isSafeHttpUrl, isSmartstoreProductUrl, latestObservation,
  parseKg, parseMoney, perKg, shippingLabel, sortedObservations, toDatetimeLocal, won,
} from "@/components/reports/competitor/competitor-utils";
import { computeScenario } from "@/components/reports/competitor/cost-scenario";

describe("datetime-local conversion", () => {
  it("round-trips a browser-local value through ISO", () => {
    const local = "2026-09-14T10:30";
    const iso = fromDatetimeLocal(local);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(toDatetimeLocal(new Date(iso as string))).toBe(local);
  });
  it("rejects malformed or impossible values", () => {
    expect(fromDatetimeLocal("")).toBeNull();
    expect(fromDatetimeLocal("2026-09-14")).toBeNull();
    expect(fromDatetimeLocal("2026-13-40T10:30")).toBeNull();
    expect(toDatetimeLocal(new Date("nope"))).toBe("");
  });
});

describe("money and weight parsing", () => {
  it("treats blank as unknown and zero as a real zero", () => {
    expect(parseMoney("")).toEqual({ ok: true, value: null });
    expect(parseMoney("   ")).toEqual({ ok: true, value: null });
    expect(parseMoney("0")).toEqual({ ok: true, value: 0 });
    expect(parseMoney("12,900")).toEqual({ ok: true, value: 12900 });
  });
  it("rejects negatives, decimals, text and oversized amounts", () => {
    expect(parseMoney("-1").ok).toBe(false);
    expect(parseMoney("1.5").ok).toBe(false);
    expect(parseMoney("만원").ok).toBe(false);
    expect(parseMoney("10000001").ok).toBe(false);
  });
  it("bounds package weight to the server schema", () => {
    expect(parseKg("1.5")).toEqual({ ok: true, value: 1.5 });
    expect(parseKg("").ok).toBe(false);
    expect(parseKg("0.01").ok).toBe(false);
    expect(parseKg("51").ok).toBe(false);
    expect(parseKg("abc").ok).toBe(false);
  });
});

describe("links", () => {
  it("only renders http(s) links without credentials", () => {
    expect(isSafeHttpUrl("https://smartstore.naver.com/farm/products/1")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("https://user:pw@smartstore.naver.com/farm/products/1")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
  });
  it("recognises only allowed smartstore and brand product paths", () => {
    expect(isSmartstoreProductUrl("https://brand.naver.com/jbn/products/5618807799?x=1")).toBe(true);
    expect(isSmartstoreProductUrl("https://brand.naver.com.evil.test/jbn/products/1")).toBe(false);
    expect(isSmartstoreProductUrl("https://brand.naver.com/main/products/1")).toBe(false);
    expect(isSmartstoreProductUrl("https://smartstore.naver.com/farm/products/1")).toBe(true);
    expect(isSmartstoreProductUrl("https://smartstore.naver.com/farm")).toBe(false);
    expect(isSmartstoreProductUrl("https://smartstore.naver.com/farm/products/abc")).toBe(false);
    expect(isSmartstoreProductUrl("http://smartstore.naver.com/farm/products/1")).toBe(false);
    expect(isSmartstoreProductUrl("https://smartstore.naver.com:8443/farm/products/1")).toBe(false);
    expect(isSmartstoreProductUrl("https://shopping.naver.com/farm/products/1")).toBe(false);
  });
});

describe("observations", () => {
  const entry = { observations: [
    { id: "a", observedAt: "2026-09-01T00:00:00Z", price: 10000, shippingFee: 3000, availability: "IN_STOCK", notes: null },
    { id: "b", observedAt: "2026-09-10T00:00:00Z", price: 12000, shippingFee: null, availability: "UNKNOWN", notes: null },
  ] };
  it("sorts newest first without mutating the input", () => {
    const before = [...entry.observations];
    expect(sortedObservations(entry).map(item => item.id)).toEqual(["b", "a"]);
    expect(entry.observations).toEqual(before);
    expect(latestObservation(entry)?.id).toBe("b");
    expect(latestObservation({ observations: [] })).toBeNull();
  });
  it("only sums delivered price when both sides are known", () => {
    expect(deliveredPrice(entry.observations[0])).toBe(13000);
    expect(deliveredPrice(entry.observations[1])).toBeNull();
    expect(perKg(13000, 2)).toBe(6500);
    expect(perKg(null, 2)).toBeNull();
    expect(shippingLabel(0)).toBe("무료배송");
    expect(shippingLabel(null)).toBe("배송비 미확인");
    expect(won(null)).toBe("미확인");
    expect(won(12900)).toBe("12,900원");
  });
  it("maps known error codes and falls back for unknown ones", () => {
    expect(describeSearchError("RATE_LIMITED")).toMatch(/한도/);
    expect(describeSearchError("SOMETHING")).toBe("검색을 완료하지 못했습니다.");
    expect(describeSearchError(null)).toBe("검색을 완료하지 못했습니다.");
  });
});

describe("cost scenario", () => {
  const base = { packageKg: 2, produceCostPerKg: 3000, packagingCost: 1000, shippingCost: 3000, platformFeePct: 5, targetMarginPct: 15 };
  it("derives break-even and target prices from explicit assumptions", () => {
    const scenario = computeScenario(base, 12000);
    expect(scenario).not.toBeNull();
    expect(scenario?.costBeforeFee).toBe(10000);
    expect(scenario?.breakEvenPrice).toBe(Math.round(10000 / 0.95));
    expect(scenario?.targetPrice).toBe(12500);
    expect(scenario?.targetPerKg).toBe(6250);
    expect(scenario?.medianGapPct).toBe(4.2);
  });
  it("returns null for impossible assumptions and skips the gap without a median", () => {
    expect(computeScenario({ ...base, platformFeePct: 100 }, 12000)).toBeNull();
    expect(computeScenario({ ...base, targetMarginPct: 95 }, 12000)).toBeNull();
    expect(computeScenario({ ...base, packageKg: 0 }, 12000)).toBeNull();
    expect(computeScenario({ ...base, shippingCost: -1 }, 12000)).toBeNull();
    expect(computeScenario(base, null)?.medianGapPct).toBeNull();
  });
});
