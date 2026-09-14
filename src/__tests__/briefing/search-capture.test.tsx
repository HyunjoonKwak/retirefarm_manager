import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readSearchCapture, type SearchCapture } from "@/components/reports/competitor/search-capture";
import { SearchCaptureReview } from "@/components/reports/competitor/SearchCaptureReview";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const sourceUrl = "https://search.shopping.naver.com/ns/search?query=tomato&sort=SALE";
const capture = (): SearchCapture => ({ schemaVersion: "retirefarm-visible-search-v1", sourceUrl, query: "tomato", capturedAt: new Date(Date.now() - 1000).toISOString(),
  searchSort: "판매 많은순", searchEnvironment: "BROWSER_UNSPECIFIED", items: [{ productUrl: "https://smartstore.naver.com/farm-a/products/1",
    urlStatus: "COMPOSED", title: "토마토 2kg", storeName: "테스트농장", position: 1, adStatus: "UNKNOWN", purchaseLabel: "", reviewCount: 200, reviewBasis: "UNKNOWN" }] });

describe("search capture envelope", () => {
  it("normalizes source tracking without inventing review basis or an organic status", () => {
    const result = readSearchCapture({ ...capture(), sourceUrl: `${sourceUrl}&NaPm=tracking#fragment` });
    expect(result.sourceUrl).toBe(sourceUrl);
    expect(result.items[0]).toMatchObject({ urlStatus: "COMPOSED", adStatus: "UNKNOWN", reviewBasis: "UNKNOWN" });
  });
  it("rejects wrong hosts, source query mismatch, duplicate positions and invented confirmed status", () => {
    const base = capture();
    for (const bad of [{ ...base, sourceUrl: "https://evil.test/ns/search?query=tomato" }, { ...base, sourceUrl: "https://search.shopping.naver.com/search/all?query=tomato" }, { ...base, query: "another" },
      { ...base, items: [base.items[0], base.items[0]] }, { ...base, items: [{ ...base.items[0], adStatus: "ORGANIC" }] },
      { ...base, items: [{ ...base.items[0], productUrl: null }] }, { ...base, items: [{ ...base.items[0], productUrl: "javascript:alert(1)" }] },
      { ...base, items: Array.from({ length: 21 }, (_, i) => ({ ...base.items[0], position: i + 1 })) }]) expect(() => readSearchCapture(bad)).toThrow();
  });
  it("rejects future and expired captures", () => {
    const base = capture(), now = new Date();
    expect(() => readSearchCapture({ ...base, capturedAt: new Date(now.getTime() + 1000).toISOString() }, now)).toThrow(/24시간/);
    expect(() => readSearchCapture({ ...base, capturedAt: new Date(now.getTime() - 86400001).toISOString() }, now)).toThrow(/24시간/);
  });
});

describe("search capture review", () => {
  it("selects nothing initially and requires explicit review before saving with original source and time", async () => {
    const base = capture(), onSave = vi.fn().mockResolvedValue(true), onCancel = vi.fn();
    render(<SearchCaptureReview capture={base} busy={false} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: "선택 0개 후보 저장" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /목록 1/ }));
    expect(screen.getByRole("button", { name: "선택 1개 후보 저장" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("목록 1 광고 여부"), { target: { value: "ORGANIC" } });
    fireEvent.change(screen.getByLabelText("목록 1 품목 확인"), { target: { value: "MATCH" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /선택 항목의 상품 주소/ }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1개 후보 저장" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0]).toMatchObject({ action: "import", evidence: [{ productUrl: base.items[0].productUrl, adStatus: "ORGANIC", relevance: "MATCH",
      observedAt: base.capturedAt, collectionMethod: "EXTENSION", sourceUrl, searchSort: "판매 많은순", searchEnvironment: "BROWSER_UNSPECIFIED", reviewBasis: "UNKNOWN" }] });
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it("never allows an observed advertisement to be relabeled organic", () => {
    const base = capture(); base.items[0].adStatus = "AD";
    render(<SearchCaptureReview capture={base} busy={false} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("목록 1 광고 여부")).toBeDisabled();
    expect(screen.getByLabelText("목록 1 광고 여부")).toHaveValue("AD");
  });
  it("invalidates confirmation after edits and keeps failed imports reviewable", async () => {
    const onSave = vi.fn().mockResolvedValue(false), onCancel = vi.fn();
    render(<SearchCaptureReview capture={capture()} busy={false} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /목록 1/ }));
    const confirm = screen.getByRole("checkbox", { name: /선택 항목의 상품 주소/ });
    fireEvent.click(confirm);
    fireEvent.change(screen.getByLabelText("목록 1 실제 상품 주소"), { target: { value: "https://brand.naver.com/farm-b/products/2" } });
    expect(confirm).not.toBeChecked();
    fireEvent.click(confirm); fireEvent.click(screen.getByRole("button", { name: "선택 1개 후보 저장" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onCancel).not.toHaveBeenCalled();
  });
  it("rejects unresolved URLs and rechecks freshness at save time", async () => {
    const base = capture(); base.items[0].productUrl = null; base.items[0].urlStatus = "UNRESOLVED";
    const onSave = vi.fn(); render(<SearchCaptureReview capture={base} busy={false} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /목록 1/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /선택 항목의 상품 주소/ }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1개 후보 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/실제 상품 주소/);
    expect(onSave).not.toHaveBeenCalled();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(Date.now() + 2 * 86400000));
    fireEvent.change(screen.getByLabelText("목록 1 실제 상품 주소"), { target: { value: "https://smartstore.naver.com/farm-a/products/1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /선택 항목의 상품 주소/ }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1개 후보 저장" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/24시간/);
    expect(onSave).not.toHaveBeenCalled();
  });
});
