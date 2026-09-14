import { describe, expect, it } from "vitest";
import { readCaptureInput } from "@/components/reports/competitor/visible-capture";

const now = new Date("2026-09-14T07:00:00Z");
const url = "https://brand.naver.com/jbn/products/5618807799";
const capture = (patch: Record<string, unknown> = {}) => JSON.stringify({
  schemaVersion: "retirefarm-visible-product-v1", productUrl: `${url}?tracking=discard`, capturedAt: "2026-09-14T06:45:00Z",
  title: "대추방울토마토", text: "선택 옵션: 중과 2kg\n총 금액 18,500원\n무료배송", method: "product-region", ...patch,
});

describe("untrusted browser capture import", () => {
  it("matches the exact product, strips tracking and keeps original capture time", () => {
    expect(readCaptureInput(capture(), url, now)).toMatchObject({ ok: true, capture: { productUrl: url, capturedAt: "2026-09-14T06:45:00Z" } });
    expect(readCaptureInput(capture(), url.toUpperCase() + "/?from=panel", now).ok).toBe(true);
  });
  it("rejects wrong products and hosts even when an option label matches", () => {
    for (const productUrl of [url + "1", "https://smartstore.naver.com/jbn/products/5618807799", "https://brand.naver.com.evil.test/jbn/products/5618807799", "https://user@brand.naver.com/jbn/products/5618807799", "https://constructor/jbn/products/5618807799", "http://brand.naver.com/jbn/products/5618807799"])
      expect(readCaptureInput(capture({ productUrl }), url, now).ok, productUrl).toBe(false);
  });
  it("rejects future and expired captures instead of relabelling them as current observations", () => {
    for (const capturedAt of ["2026-09-14T07:00:01Z", "2026-09-13T06:59:59Z", "bad-time"])
      expect(readCaptureInput(capture({ capturedAt }), url, now).ok).toBe(false);
  });
  it("never treats invalid envelope JSON as ordinary product text", () => {
    for (const text of ["{broken", "[]", capture({ schemaVersion: "other" }), capture({ price: 1 }), capture({ text: "x".repeat(30001) }), capture({ method: "background" }), "x".repeat(40001)])
      expect(readCaptureInput(text, url, now).ok).toBe(false);
  });
  it("preserves the manual text workflow without pretending it has a source timestamp", () => {
    expect(readCaptureInput("총 금액 18,500원", url, now)).toEqual({ ok: true, text: "총 금액 18,500원" });
    expect(readCaptureInput("x".repeat(30001), url, now).ok).toBe(false);
  });
});
