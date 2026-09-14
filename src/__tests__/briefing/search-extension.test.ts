// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://search.shopping.naver.com/ns/search?query=%EB%8C%80%EC%B6%94%EB%B0%A9%EC%9A%B8%ED%86%A0%EB%A7%88%ED%86%A0%20%202KG&NaPm=ct%3Dabc&sort=rel" }
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEARCH_CARD_LIMIT, SEARCH_SCHEMA_VERSION, captureVisibleSearch, normalizeSearchUrl } from "../../../browser-extension/competitor-capture/search-capture.js";
import { normalizeDiscoverySourceUrl } from "@/lib/briefing/discovery-contracts";

const SOURCE = "https://search.shopping.naver.com/ns/search";
const readSource = () => fs.readFileSync(path.resolve(__dirname, "../../../browser-extension/competitor-capture/search-capture.js"), "utf8");
const CANONICAL = normalizeDiscoverySourceUrl(window.location.href)!;
const outlink = (root: string) => `https://smartstore.naver.com/inflow/outlink/url?url=${encodeURIComponent(root)}`;
const MAIN = (id: number | string) => `https://smartstore.naver.com/main/products/${id}`;
const STORE_ROOT = "https://smartstore.naver.com/farm-a";

interface CardSpec {
  id?: number | string; title?: string; storeName?: string; storeHref?: string | null; overlays?: string[]; overlayLabel?: string;
  infoExtra?: string; cardExtra?: string; reviews?: string[]; purchase?: string; wrap?: (inner: string) => string;
}
// Replica of the accessibility tree observed on /ns/search on 2026-09-14: overlay link on the card, info block with store link, strong title and review spans.
const card = ({ id = 1001, title = "대추방울토마토 2kg", storeName = "농장A", storeHref = outlink(STORE_ROOT), overlays = [MAIN(id)], overlayLabel = "",
  infoExtra = "", cardExtra = "", reviews = ["리뷰 1,234"], purchase = "구매 1,000+", wrap }: CardSpec = {}) => {
  const overlayHtml = overlays.map(href => `<a href="${href}"${overlayLabel ? ` aria-label="${overlayLabel}"` : ""}><span class="sr">상품 상세로 이동</span></a>`).join("");
  const store = storeHref === null ? `<span>${storeName}</span>` : `<a href="${storeHref}"><span>${storeName}</span><span class="sr">새 창에서 열림</span></a>`;
  const inner = `${overlayHtml}<div id="basic_product_card_information_${id}">${store}<strong>${title}</strong>${reviews.map(r => `<span>${r}</span>`).join("")}<span>평점 4.9</span>${purchase ? `<span>${purchase}</span>` : ""}${infoExtra}</div>${cardExtra}`;
  return wrap ? wrap(inner) : `<li class="card">${inner}</li>`;
};
const render = (...cards: string[]) => {
  document.body.innerHTML = `<style>.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.gone{display:none}.faded{opacity:0}</style>
    <header><button>추천순 선택됨</button><button>낮은 가격순</button></header><ul>${cards.join("")}</ul>`;
};
const capture = (expected: string | null = CANONICAL) => captureVisibleSearch(expected);
type Envelope = NonNullable<ReturnType<typeof captureVisibleSearch>["envelope"]>;
const okCapture = (expected: string | null = CANONICAL): Envelope => {
  const result = capture(expected);
  if (!result.ok || !result.envelope) throw new Error(`expected ok capture: ${result.message}`);
  return result.envelope;
};
// jsdom has no layout: give every element one rect so visibility is decided by computed style, exactly as in a laid-out page.
const originalRects = Element.prototype.getClientRects;
const layoutOn = () => { Element.prototype.getClientRects = function () { return [{ width: 10, height: 10 }] as unknown as DOMRectList; }; };
const layoutOff = () => { Element.prototype.getClientRects = originalRects; };
beforeEach(layoutOn);
afterEach(() => { layoutOff(); document.body.innerHTML = ""; window.history.replaceState(null, "", CANONICAL.replace("https://search.shopping.naver.com", "")); });

describe("normalizeSearchUrl", () => {
  const cases = [
    "https://search.shopping.naver.com/ns/search?query=%EB%8C%80%EC%B6%94%EB%B0%A9%EC%9A%B8%ED%86%A0%EB%A7%88%ED%86%A0%202kg&NaPm=ct%3Dx&sort=rel&pagingIndex=002#top",
    "  https://search.shopping.naver.com/search/all/?query=%20Tomato%20%20%202KG%20&frm=NVSHATC  ",
    "https://search.shopping.naver.com/search/all?pagingIndex=100&query=a", "https://search.shopping.naver.com/ns/search?query=a&sort=price_asc",
    "http://search.shopping.naver.com/ns/search?query=a", "https://search.shopping.naver.com:8443/ns/search?query=a", "https://user:pw@search.shopping.naver.com/ns/search?query=a",
    "https://search.shopping.naver.com.evil.test/ns/search?query=a", "https://msearch.shopping.naver.com/search/all?query=a", "https://search.shopping.naver.com/ns/search/detail?query=a",
    "https://search.shopping.naver.com/search/category?query=a", "https://search.shopping.naver.com/ns/search", "https://search.shopping.naver.com/ns/search?query=%20",
    `https://search.shopping.naver.com/ns/search?query=${"x".repeat(101)}`, "https://search.shopping.naver.com/ns/search?query=a&query=b",
    "https://search.shopping.naver.com/ns/search?query=a&sort=rel&sort=date", "https://search.shopping.naver.com/ns/search?query=a&pagingIndex=1&pagingIndex=2",
    "https://search.shopping.naver.com/ns/search?query=a&pagingIndex=0", "https://search.shopping.naver.com/ns/search?query=a&pagingIndex=101",
    "https://search.shopping.naver.com/ns/search?query=a&pagingIndex=1.5", "https://search.shopping.naver.com/ns/search?query=a&sort=%3Cscript%3E",
    "javascript:alert(1)", "chrome://extensions", "", "not a url",
  ];
  it.each(cases)("matches the app-side canonical form for %s", (value) => {
    expect(normalizeSearchUrl(value)).toBe(normalizeDiscoverySourceUrl(value));
  });
  it("casefolds and collapses the query, keeps only query/sort/pagingIndex in order and rejects everything else", () => {
    expect(normalizeSearchUrl(cases[0])).toBe("https://search.shopping.naver.com/ns/search?query=%EB%8C%80%EC%B6%94%EB%B0%A9%EC%9A%B8%ED%86%A0%EB%A7%88%ED%86%A0+2kg&sort=rel&pagingIndex=2");
    expect(normalizeSearchUrl(cases[1])).toBe("https://search.shopping.naver.com/search/all?query=tomato+2kg");
    expect(normalizeSearchUrl(cases[2])).toBe("https://search.shopping.naver.com/search/all?query=a&pagingIndex=100");
    expect(cases.slice(4).map(normalizeSearchUrl).every(v => v === null)).toBe(true);
  });
});

describe("captureVisibleSearch source guard", () => {
  it("keeps the injected extractor self-contained and free of network, storage or hidden-data access", () => {
    const body = captureVisibleSearch.toString();
    expect(body.startsWith("function captureVisibleSearch(")).toBe(true);
    for (const symbol of ["normalizeSearchUrl", "SEARCH_SCHEMA_VERSION", "SEARCH_CARD_LIMIT", "import", "require("]) expect(body, symbol).not.toContain(symbol);
    const source = readSource();
    for (const banned of ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "document.cookie", "chrome.cookies", "chrome.storage", "localStorage", "sessionStorage", "indexedDB",
      "__NEXT_DATA__", "__PRELOADED_STATE__", "application/json", "innerHTML", "eval(", "console.log", "setInterval"]) expect(source, banned).not.toContain(banned);
    // The card shape comes from a DOM replica of the observed accessibility tree; the source must not claim installed-extension validation.
    expect(source).toContain("not yet validated inside an installed extension");
    expect(SEARCH_CARD_LIMIT).toBe(20);
  });
  it("refuses when the popup's expected URL differs from the current page or the page is not the Naver+ store search", () => {
    render(card());
    expect(capture(`${SOURCE}?query=%EB%8B%A4%EB%A5%B8+%EA%B2%80%EC%83%89%EC%96%B4`)).toMatchObject({ ok: false, message: expect.stringContaining("검색 주소가 바뀌었습니다") });
    expect(capture(null)).toMatchObject({ ok: false });
    window.history.replaceState(null, "", "/search/all?query=%EB%8C%80%EC%B6%94%EB%B0%A9%EC%9A%B8%ED%86%A0%EB%A7%88%ED%86%A0+2kg");
    const all = normalizeSearchUrl(window.location.href)!;
    expect(capture(all)).toMatchObject({ ok: false, message: expect.stringContaining("네이버플러스 스토어 검색") });
  });
  it("fails closed on pages without supported cards or without a safely separable card", () => {
    render("<ul><li><div class='other_card'><strong>제목</strong></div></li></ul>");
    expect(capture()).toMatchObject({ ok: false, code: "no-cards", message: expect.stringContaining("지원되는 상품 목록이 없습니다") });
    render(card({ title: "" }));
    expect(capture()).toMatchObject({ ok: false, code: "no-items", message: expect.stringContaining("안전하게 구분하지 못했습니다") });
    document.body.innerHTML = "";
    expect(capture()).toMatchObject({ ok: false, code: "no-cards" });
  });
  it("fails closed without layout instead of relaxing visibility for a page that has not rendered", () => {
    render(card());
    layoutOff();
    expect(capture()).toMatchObject({ ok: false, code: "no-layout" });
    layoutOn();
    expect(capture()).toMatchObject({ ok: true });
  });
  it("reports a security check or access limit as such, never bypasses it and never exports the page copy", () => {
    // Observed 2026-09-14: a live /ns/search navigation rendered "보안 확인을 완료해 주세요" instead of cards.
    for (const copy of ["보안 확인을 완료해 주세요", "실제 사용자인지 확인이 필요합니다", "접근이 제한되었습니다", "자동 입력 방지 문자를 입력하세요", "로그인이 필요한 서비스입니다"]) {
      render(`<main><h1>${copy}</h1><p>secret-body-token</p><button>확인</button></main>`);
      const result = capture();
      expect(result).toMatchObject({ ok: false, code: "access-restricted", message: expect.stringContaining("보안 확인 또는 접근 제한") });
      expect(JSON.stringify(result)).not.toContain("secret-body-token");
    }
    // The marker must be visible: hidden copy alone does not change the failure code.
    render("<main><h1 class='gone'>보안 확인을 완료해 주세요</h1><p>안내</p></main>");
    expect(capture()).toMatchObject({ ok: false, code: "no-cards" });
    // Cards present alongside restricted copy still export normally.
    render(`<p>보안 확인 안내</p>${card()}`);
    expect(capture()).toMatchObject({ ok: true });
  });
});

describe("captureVisibleSearch cards", () => {
  it("emits DIRECT for a real product link, COMPOSED from the same card's seller root plus main id, and UNRESOLVED otherwise", () => {
    render(
      card({ id: 1, overlays: ["https://brand.naver.com/JBN/products/5618807799?NaPm=x#a"], storeHref: "https://brand.naver.com/jbn" }),
      card({ id: 2, storeName: "농장B", storeHref: outlink("https://smartstore.naver.com/Farm-B"), overlays: [MAIN(2)] }),
      card({ id: 3, storeName: "농장C", storeHref: "https://shopping.naver.com/brands/farm-c", overlays: [MAIN(3)] }),
      card({ id: 4, storeName: "농장D", overlays: ["https://ader.naver.com/v1/click?x=opaque"] }),
      // A card whose seller cannot be identified from a link is skipped entirely rather than guessed.
      card({ id: 5, storeName: "농장E", storeHref: null, overlays: [MAIN(5)] }),
      card({ id: 6, storeName: "농장F" }),
    );
    const { items } = okCapture();
    expect(items.map(i => [i.position, i.urlStatus, i.productUrl])).toEqual([
      [1, "DIRECT", "https://brand.naver.com/jbn/products/5618807799"],
      [2, "COMPOSED", "https://smartstore.naver.com/farm-b/products/2"],
      [3, "UNRESOLVED", null],
      [4, "UNRESOLVED", null],
      [6, "COMPOSED", "https://smartstore.naver.com/farm-a/products/6"],
    ]);
    expect(items[2]).toMatchObject({ storeName: "농장C", adStatus: "UNKNOWN" });
    expect(items[3].adStatus).toBe("AD");
    expect(JSON.stringify(items)).not.toMatch(/ader\.naver\.com|inflow\/outlink|main\/products/);
  });
  it("never composes when a card shows several main ids, several direct urls, or a direct url of another seller", () => {
    render(
      card({ id: 1, overlays: [MAIN(1), MAIN(2)] }),
      card({ id: 3, storeName: "농장B", overlays: ["https://smartstore.naver.com/farm-a/products/3", "https://smartstore.naver.com/farm-a/products/4"] }),
      card({ id: 5, storeName: "농장C", overlays: ["https://smartstore.naver.com/farm-a/products/5", MAIN(6)] }),
      // A direct link to another store's product (e.g. a recommendation) must not be attributed to the observed seller.
      card({ id: 7, storeName: "농장D", overlays: ["https://smartstore.naver.com/other-store/products/7"] }),
      card({ id: 8, storeName: "농장E", storeHref: "https://brand.naver.com/farm-a", overlays: ["https://smartstore.naver.com/farm-a/products/8"] }),
      // The same spelled-differently direct link counts once and matches the seller root.
      card({ id: 9, storeName: "농장F", overlays: ["https://smartstore.naver.com/Farm-A/products/9?NaPm=x", "https://smartstore.naver.com/farm-a/products/9/"] }),
    );
    const { items } = okCapture();
    expect(items.map(i => [i.urlStatus, i.productUrl])).toEqual([
      ["UNRESOLVED", null], ["UNRESOLVED", null], ["DIRECT", "https://smartstore.naver.com/farm-a/products/5"],
      ["UNRESOLVED", null], ["UNRESOLVED", null], ["DIRECT", "https://smartstore.naver.com/farm-a/products/9"],
    ]);
    expect(items[3].storeName).toBe("농장D");
  });
  it.each([
    ["outlink to a foreign host", outlink("https://evil.test/smartstore.naver.com/farm-a")],
    ["outlink to a look-alike host", outlink("https://smartstore.naver.com.evil.test/farm-a")],
    ["nested outlink", outlink(outlink(STORE_ROOT))],
    ["outlink with two url params", `${outlink(STORE_ROOT)}&url=${encodeURIComponent("https://evil.test/x")}`],
    ["outlink to a reserved slug", outlink("https://smartstore.naver.com/main")],
    ["outlink to a product path", outlink("https://smartstore.naver.com/farm-a/products/1")],
    ["outlink with javascript scheme", outlink("javascript:alert(1)")],
    ["http seller root", "http://smartstore.naver.com/farm-a"],
    ["seller root with credentials", "https://user:pw@smartstore.naver.com/farm-a"],
    ["outlink on the wrong host", "https://brand.naver.com/inflow/outlink/url?url=https%3A%2F%2Fsmartstore.naver.com%2Ffarm-a"],
  ])("leaves the url UNRESOLVED and exports no redirect for %s", (_label, storeHref) => {
    render(card({ storeHref }));
    const [item] = okCapture().items;
    expect(item).toMatchObject({ urlStatus: "UNRESOLVED", productUrl: null, storeName: "농장A" });
    expect(JSON.stringify(item)).not.toMatch(/evil|outlink|javascript/);
  });
  it("skips cards whose parent groups more than one information block, keeping the page ordinal for the rest", () => {
    const grouped = `<li class="card">${card({ id: 1, wrap: inner => inner })}${card({ id: 2, storeName: "농장B", wrap: inner => inner })}</li>`;
    render(grouped, card({ id: 3, storeName: "농장C" }));
    const { items } = okCapture();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ position: 3, storeName: "농장C", urlStatus: "COMPOSED", productUrl: "https://smartstore.naver.com/farm-a/products/3" });
  });
  it("exports at most 20 rendered cards in page order", () => {
    render(...Array.from({ length: 25 }, (_, i) => card({ id: i + 1, storeName: `농장${i + 1}` })));
    const { items } = okCapture();
    expect(items).toHaveLength(SEARCH_CARD_LIMIT);
    expect(items.map(i => i.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(items[19].productUrl).toBe("https://smartstore.naver.com/farm-a/products/20");
  });
});

describe("ad status", () => {
  it("marks AD from an accessible label, a nested visible badge or an ader link, and otherwise stays UNKNOWN (never ORGANIC)", () => {
    render(
      card({ id: 1, overlayLabel: "광고 대추방울토마토 2kg 상품 상세" }),
      card({ id: 2, storeName: "농장B", cardExtra: "<div class='badge'><span><em>광고</em></span></div>" }),
      card({ id: 3, storeName: "농장C", overlays: ["https://ader.naver.com/v1/click?x=1"] }),
      card({ id: 4, storeName: "농장D" }),
      card({ id: 5, storeName: "농장E", cardExtra: "<span role='img' aria-label='광고'>AD</span>" }),
    );
    const { items } = okCapture();
    expect(items.map(i => i.adStatus)).toEqual(["AD", "AD", "AD", "UNKNOWN", "AD"]);
    expect(items.some(i => (i.adStatus as string) === "ORGANIC")).toBe(false);
  });
  it("does not promote hidden, aria-hidden or transparent ad markers, and ignores 광고 embedded in a word", () => {
    render(
      card({ id: 1, cardExtra: "<span class='gone'>광고</span>" }),
      card({ id: 2, storeName: "농장B", cardExtra: "<span class='faded'>광고</span>" }),
      card({ id: 3, storeName: "농장C", cardExtra: "<span aria-hidden='true'>광고</span><span aria-hidden='true'><i aria-label='광고'></i></span>" }),
      card({ id: 4, storeName: "농장D", cardExtra: "<span hidden>광고</span><template><span>광고</span></template><script type='application/ld+json'>{\"ad\":\"광고\"}</script>" }),
      card({ id: 5, storeName: "농장E", title: "비광고성 대추방울토마토 2kg" }),
      // Accessible labels count only on visible elements: hidden or transparent labelled nodes never mark a card as AD.
      card({ id: 6, storeName: "농장F", cardExtra: "<span class='faded' aria-label='광고'></span><span class='gone' aria-label='광고 상품'></span><span style='visibility:hidden' aria-label='광고'></span>" }),
    );
    expect(okCapture().items.map(i => i.adStatus)).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
  });
});

describe("visible text", () => {
  it("reads only visible text nodes: hidden, transparent, aria-hidden, screen-reader-only and script content never reach the copy", () => {
    render(card({
      title: "대추방울토마토 2kg<span class='gone'> 숨김</span><span class='faded'> 투명</span><span aria-hidden='true'> 보조</span><span style='visibility:hidden'> 비가시</span><span class='sr'> 리더전용</span>",
      infoExtra: "<span class='gone'>리뷰 9,999</span><span class='faded'>구매 5만+</span><script>리뷰 1</script>",
    }));
    const [item] = okCapture().items;
    expect(item.title).toBe("대추방울토마토 2kg");
    expect(item.storeName).toBe("농장A");
    expect(item).toMatchObject({ reviewCount: 1234, purchaseLabel: "구매 1,000+" });
  });
  it("collapses whitespace across nested inline nodes and strips the accessibility suffixes from the store name", () => {
    render(card({ storeName: "  농장   <b>A</b> ", infoExtra: "" }));
    expect(okCapture().items[0].storeName).toBe("농장 A");
    render(card({ storeHref: STORE_ROOT, storeName: "농장A<span> 우수셀러</span><span> 공식</span>" }));
    expect(okCapture().items[0].storeName).toBe("농장A");
  });
});

describe("reviews and purchase text", () => {
  it("reads a single comma-grouped review count and refuses ratings, ambiguous or conflicting readings", () => {
    render(
      card({ id: 1, reviews: ["리뷰 12,345"] }),
      card({ id: 2, storeName: "농장B", reviews: ["리뷰 4.9"] }),
      card({ id: 3, storeName: "농장C", reviews: ["리뷰 120", "리뷰 121"] }),
      card({ id: 4, storeName: "농장D", reviews: ["리뷰 120", "리뷰 120"] }),
      card({ id: 5, storeName: "농장E", reviews: [] }),
      card({ id: 6, storeName: "농장F", reviews: ["리뷰<em>2,000</em>건"] }),
      card({ id: 7, storeName: "농장G", reviews: ["리뷰 100,000,001"] }),
    );
    const { items } = okCapture();
    expect(items.map(i => i.reviewCount)).toEqual([12345, null, null, 120, null, 2000, null]);
    expect(items.every(i => i.reviewBasis === "UNKNOWN")).toBe(true);
  });
  it("keeps the purchase text verbatim and never derives a sales figure or store search volume", () => {
    render(card({ purchase: "구매 5천+" }), card({ id: 2, storeName: "농장B", purchase: "" }));
    const { items } = okCapture();
    expect(items.map(i => i.purchaseLabel)).toEqual(["구매 5천+", ""]);
    for (const item of items) {
      expect(Object.keys(item)).toEqual(["productUrl", "urlStatus", "title", "storeName", "position", "adStatus", "purchaseLabel", "reviewCount", "reviewBasis"]);
      expect(JSON.stringify(item)).not.toMatch(/sales|salesCount|purchaseCount|searchVolume|relevance/);
    }
  });
});

describe("envelope metadata", () => {
  it("carries the canonical casefolded source URL and query, the selected sort, an unspecified environment and an ISO timestamp", () => {
    render(card());
    const envelope = okCapture();
    expect(envelope.schemaVersion).toBe(SEARCH_SCHEMA_VERSION);
    expect(envelope.sourceUrl).toBe("https://search.shopping.naver.com/ns/search?query=%EB%8C%80%EC%B6%94%EB%B0%A9%EC%9A%B8%ED%86%A0%EB%A7%88%ED%86%A0+2kg&sort=rel");
    expect(envelope.sourceUrl).toBe(normalizeDiscoverySourceUrl(window.location.href));
    expect(envelope.query).toBe("대추방울토마토 2kg");
    expect(envelope.searchSort).toBe("추천순");
    expect(envelope.searchEnvironment).toBe("BROWSER_UNSPECIFIED");
    expect(new Date(envelope.capturedAt).toISOString()).toBe(envelope.capturedAt);
    expect(Object.keys(envelope)).toEqual(["schemaVersion", "sourceUrl", "query", "capturedAt", "searchSort", "searchEnvironment", "items"]);
    expect(JSON.stringify(envelope)).not.toContain("NaPm");
  });
  it("reads selected visible button labels, ignores hidden labels and rejects disagreement", () => {
    render(card());
    const header = document.querySelector("header")!;
    header.innerHTML = '<button aria-label="판매 많은순 선택됨"></button><button hidden aria-label="추천순 선택됨"></button>';
    expect(okCapture().searchSort).toBe("판매 많은순");
    header.innerHTML = '<button aria-label="판매 많은순 선택됨">판매 많은순 선택됨</button>';
    expect(okCapture().searchSort).toBe("판매 많은순");
    header.innerHTML = '<button aria-label="판매 많은순 선택됨">추천순 선택됨</button>';
    expect(okCapture().searchSort).toBe("UNKNOWN");
  });
  it("reports UNKNOWN sort when no single selected sort button is visible and accepts the popup's normalised URL as expected", () => {
    render(card());
    document.querySelector("header")!.innerHTML = "<button>추천순 선택됨</button><button>리뷰 많은순 선택됨</button>";
    expect(okCapture(normalizeSearchUrl(window.location.href)!).searchSort).toBe("UNKNOWN");
    document.querySelector("header")!.innerHTML = "";
    expect(okCapture().searchSort).toBe("UNKNOWN");
  });
});
