// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  NAVER_SHOPPING_ENDPOINT,
  SHOPPING_FETCH_TIMEOUT_MS,
  SHOPPING_MAX_RESPONSE_BYTES,
  ShoppingSearchError,
  cleanShoppingText,
  classifyVariety,
  extractSmartstoreKey,
  proposePackageWeight,
  sanitizeShoppingUrl,
  searchNaverShopping,
  type ShoppingCredentials,
} from "@/lib/briefing/naver-shopping";

const CREDENTIALS: ShoppingCredentials = { clientId: "client-id-abc", clientSecret: "secret-xyz-123" };
const NOW = new Date("2026-09-14T03:00:00.000Z");
const now = () => NOW;

type RawItem = Record<string, unknown>;
const item = (overrides: RawItem = {}): RawItem => ({
  title: "<b>방울토마토</b> 대추 5kg",
  link: "http://openapi.naver.com/l?AAABWLsQ7CIBRFv",
  image: "http://shopping.phinf.naver.net/main_1/1.jpg",
  lprice: "12900",
  hprice: "0",
  mallName: "농부네",
  productId: "10315467179",
  productType: "2",
  brand: "",
  maker: "",
  category1: "식품",
  category2: "농산물",
  category3: "채소",
  category4: "토마토",
  ...overrides,
});
const body = (items: RawItem[], total = items.length) => ({
  lastBuildDate: "Mon, 14 Sep 2026 12:00:00 +0900",
  total: String(total),
  start: "1",
  display: String(items.length),
  items,
});
const jsonResponse = (payload: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json;charset=utf-8" }, ...init });
const fetcherReturning = (response: Response | (() => Response | Promise<Response>)) =>
  vi.fn(async () => (typeof response === "function" ? response() : response));
const search = (fetcher: typeof fetch, query = "방울토마토") =>
  searchNaverShopping(query, CREDENTIALS, fetcher, { now });
const expectError = async (promise: Promise<unknown>, code: ShoppingSearchError["code"], status: number | null = null) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ShoppingSearchError);
  const typed = error as ShoppingSearchError;
  expect(typed.code).toBe(code);
  expect(typed.status).toBe(status);
  return typed;
};

describe("searchNaverShopping request contract", () => {
  it("calls the official JSON endpoint once with display=100, start=1, sort=sim and credential headers", async () => {
    const fetcher = fetcherReturning(jsonResponse(body([item()])));
    const result = await search(fetcher as unknown as typeof fetch, "  방울토마토   대추 ");

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(NAVER_SHOPPING_ENDPOINT);
    expect(parsed.hostname).toBe("openapi.naver.com");
    expect(parsed.protocol).toBe("https:");
    expect(parsed.searchParams.get("query")).toBe("방울토마토 대추");
    expect(parsed.searchParams.get("display")).toBe("100");
    expect(parsed.searchParams.get("start")).toBe("1");
    expect(parsed.searchParams.get("sort")).toBe("sim");
    expect([...parsed.searchParams.keys()].sort()).toEqual(["display", "query", "sort", "start"]);

    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Naver-Client-Id"]).toBe(CREDENTIALS.clientId);
    expect(headers["X-Naver-Client-Secret"]).toBe(CREDENTIALS.clientSecret);
    expect(headers.Accept).toBe("application/json");

    expect(result.query).toBe("방울토마토 대추");
    expect(result.sort).toBe("sim");
    expect(result.observedAt).toBe(NOW.toISOString());
    expect(SHOPPING_FETCH_TIMEOUT_MS).toBe(12_000);
  });

  it("rejects empty, oversized, or control-character queries before any network call", async () => {
    const fetcher = fetcherReturning(jsonResponse(body([])));
    await expectError(search(fetcher as unknown as typeof fetch, "   "), "INVALID_QUERY");
    await expectError(search(fetcher as unknown as typeof fetch, "a".repeat(101)), "INVALID_QUERY");
    await expectError(search(fetcher as unknown as typeof fetch, "토마토\u0000"), "INVALID_QUERY");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects missing or header-unsafe credentials before any network call", async () => {
    const fetcher = fetcherReturning(jsonResponse(body([])));
    const attempts: ShoppingCredentials[] = [
      { clientId: "", clientSecret: "x" },
      { clientId: "id", clientSecret: " " },
      { clientId: "id\r\nX-Injected: 1", clientSecret: "secret" },
      { clientId: "id", clientSecret: "한글비밀" },
    ];
    for (const credentials of attempts) {
      const error = await searchNaverShopping("토마토", credentials, fetcher as unknown as typeof fetch).then(() => null, (e: unknown) => e as ShoppingSearchError);
      expect(error?.code).toBe("INVALID_CREDENTIALS");
      expect(error?.message).not.toContain("secret");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("searchNaverShopping transport failures", () => {
  it("maps a TimeoutError abort to TIMEOUT without retrying", async () => {
    const fetcher = vi.fn(async () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); });
    await expectError(search(fetcher as unknown as typeof fetch), "TIMEOUT");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("maps a thrown redirect failure and a 3xx response to REDIRECT", async () => {
    const thrown = vi.fn(async () => { throw new TypeError("fetch failed", { cause: new Error("unexpected redirect") }); });
    await expectError(search(thrown as unknown as typeof fetch), "REDIRECT");
    const returned = fetcherReturning(new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }));
    await expectError(search(returned as unknown as typeof fetch), "REDIRECT", 302);
  });

  it("maps generic network failures to NETWORK with a sanitized message", async () => {
    const fetcher = vi.fn(async () => { throw new Error(`ECONNRESET while sending ${CREDENTIALS.clientSecret}`); });
    const error = await expectError(search(fetcher as unknown as typeof fetch), "NETWORK");
    expect(error.message).not.toContain(CREDENTIALS.clientSecret);
  });

  it.each([
    [401, "AUTH_FAILED"],
    [403, "FORBIDDEN"],
    [429, "RATE_LIMITED"],
    [400, "BAD_REQUEST"],
    [404, "BAD_REQUEST"],
    [500, "UPSTREAM_ERROR"],
    [503, "UPSTREAM_ERROR"],
  ] as const)("maps HTTP %s to %s without retry and without echoing the upstream body", async (status, code) => {
    const upstream = { errorMessage: `Authentication failed for ${CREDENTIALS.clientSecret}`, errorCode: "024" };
    const fetcher = fetcherReturning(jsonResponse(upstream, { status }));
    const error = await expectError(search(fetcher as unknown as typeof fetch), code, status);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(error.message).not.toContain("024");
    expect(error.message).not.toContain(CREDENTIALS.clientSecret);
    expect(error.name).toBe("ShoppingSearchError");
  });
});

describe("searchNaverShopping response validation", () => {
  it("rejects non-JSON bodies", async () => {
    const fetcher = fetcherReturning(new Response("<rss></rss>", { status: 200 }));
    await expectError(search(fetcher as unknown as typeof fetch), "INVALID_RESPONSE", 200);
  });

  it("rejects bodies missing items/total or with empty product ids", async () => {
    const missing = fetcherReturning(jsonResponse({ total: "3" }));
    await expectError(search(missing as unknown as typeof fetch), "INVALID_RESPONSE", 200);
    const emptyId = fetcherReturning(jsonResponse(body([item({ productId: "  " })])));
    await expectError(search(emptyId as unknown as typeof fetch), "INVALID_RESPONSE", 200);
    const noId = fetcherReturning(jsonResponse(body([item({ productId: undefined })])));
    await expectError(search(noId as unknown as typeof fetch), "INVALID_RESPONSE", 200);
    const badPrice = fetcherReturning(jsonResponse(body([item({ lprice: "12,900" })])));
    await expectError(search(badPrice as unknown as typeof fetch), "INVALID_RESPONSE", 200);
    const tooMany = fetcherReturning(jsonResponse(body(Array.from({ length: 101 }, (_, i) => item({ productId: String(i + 1) })))));
    await expectError(search(tooMany as unknown as typeof fetch), "INVALID_RESPONSE", 200);
  });

  it("fails closed on an oversized declared Content-Length without reading the body", async () => {
    const reader = vi.fn();
    const response = new Response("{}", { status: 200, headers: { "content-length": String(SHOPPING_MAX_RESPONSE_BYTES + 1) } });
    Object.defineProperty(response, "body", { get: () => ({ getReader: reader }) });
    await expectError(search(fetcherReturning(response) as unknown as typeof fetch), "RESPONSE_TOO_LARGE", 200);
    expect(reader).not.toHaveBeenCalled();
  });

  it("stops reading a streamed body once it exceeds the byte limit", async () => {
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls += 1; controller.enqueue(chunk); },
    });
    const response = new Response(stream, { status: 200 });
    await expectError(search(fetcherReturning(response) as unknown as typeof fetch), "RESPONSE_TOO_LARGE", 200);
    expect(pulls).toBeLessThan(40);
  });
});

describe("searchNaverShopping normalization", () => {
  it("keeps API order as rank, coerces numeric strings, and nulls zero prices instead of treating them as free", async () => {
    const fetcher = fetcherReturning(jsonResponse(body([
      item({ productId: 111, lprice: 0, hprice: "99000" }),
      item({ productId: "222", lprice: "8900", hprice: "0" }),
      item({ productId: "333", lprice: "-5" }),
    ], 4321)));
    const result = await search(fetcher as unknown as typeof fetch);
    expect(result.total).toBe(4321);
    expect(result.items.map(i => i.rank)).toEqual([1, 2, 3]);
    expect(result.items.map(i => i.productId)).toEqual(["111", "222", "333"]);
    expect(result.items.map(i => i.listedPrice)).toEqual([null, 8900, null]);
    expect(result.items[0].reviewReasons).toContain("PRICE_UNAVAILABLE");
    expect(result.items[1].reviewReasons).not.toContain("PRICE_UNAVAILABLE");
    expect(result.items[0]).not.toHaveProperty("hprice");
    expect(result.items.every(i => i.reviewReasons[0] === "VERIFY_PRICE_OPTION_SHIPPING")).toBe(true);
    expect(result.items[0].productType).toBe("2");
  });

  it("strips HTML tags and decodes entities without producing markup", async () => {
    const fetcher = fetcherReturning(jsonResponse(body([
      item({ title: "<b>방울토마토</b> &lt;script&gt;alert(1)&lt;/script&gt; &amp; 대추 &#53664;&#47560;&#53664; 5kg", mallName: "<i>농부네</i>&quot;" }),
    ])));
    const result = await search(fetcher as unknown as typeof fetch);
    expect(result.items[0].title).toBe("방울토마토 <script>alert(1)</script> & 대추 토마토 5kg");
    expect(result.items[0].title).not.toMatch(/<b>|<\/b>/);
    expect(result.items[0].mallName).toBe("농부네\"");
  });

  it("rejects non-http(s) links and links carrying credentials, marking them excluded", async () => {
    const fetcher = fetcherReturning(jsonResponse(body([
      item({ productId: "1", link: "javascript:alert(1)" }),
      item({ productId: "2", link: "https://user:pw@smartstore.naver.com/farm/products/1" }),
      item({ productId: "3", link: "ftp://example.com/x" }),
      item({ productId: "4", link: "https://smartstore.naver.com/farm/products/1" }),
    ])));
    const result = await search(fetcher as unknown as typeof fetch);
    const [a, b, c, d] = result.items;
    for (const rejected of [a, b, c]) {
      expect(rejected.url).toBe("");
      expect(rejected.excluded).toBe(true);
      expect(rejected.reviewReasons).toContain("URL_REJECTED");
      expect(rejected.storeKey).toBeNull();
    }
    expect(d.url).toBe("https://smartstore.naver.com/farm/products/1");
    expect(d.excluded).toBe(false);
    expect(d.storeKey).toBe("farm");
    expect(result.excludedCount).toBe(3);
  });

  it("derives storeKey only from exact smartstore.naver.com/<store>/... URLs, never from mallName", async () => {
    const fetcher = fetcherReturning(jsonResponse(body([
      item({ productId: "1", link: "http://openapi.naver.com/l?AAA", mallName: "farm" }),
      item({ productId: "2", link: "https://m.smartstore.naver.com/farm/products/1", mallName: "farm" }),
      item({ productId: "3", link: "https://smartstore.naver.com/farm", mallName: "farm" }),
      item({ productId: "4", link: "https://smartstore.naver.com/products/123", mallName: "farm" }),
      item({ productId: "5", link: "https://brand.naver.com/farm/products/1", mallName: "farm" }),
      item({ productId: "6", link: "https://smartstore.naver.com/my_farm-1/products/9?NaPm=x", mallName: "다른몰" }),
    ])));
    const result = await search(fetcher as unknown as typeof fetch);
    expect(result.items.map(i => i.storeKey)).toEqual([null, null, null, null, null, "my_farm-1"]);
  });

  it("proposes a package weight only from a single bare kg/g token", async () => {
    const titles = [
      "방울토마토 대추 5kg",
      "방울토마토 500g",
      "방울토마토 1.5KG 산지직송",
      "방울토마토 3kg 5kg 선택",
      "방울토마토 1kg x 3",
      "방울토마토 2kg×2박스",
      "방울토마토 500g 2팩",
      "방울토마토 3~5kg",
      "방울토마토 1kg당 가격",
      "방울토마토 산지직송",
      "방울토마토 10,000g",
      "방울토마토 80kg",
    ];
    const fetcher = fetcherReturning(jsonResponse(body(titles.map((title, i) => item({ title, productId: String(i + 1) })))));
    const result = await search(fetcher as unknown as typeof fetch);
    expect(result.items.map(i => i.proposedPackageKg)).toEqual([5, 0.5, 1.5, null, null, null, null, null, null, null, null, null]);
    expect(result.items[0].reviewReasons).toContain("WEIGHT_PROPOSED_FROM_TITLE");
    for (const index of [3, 4, 5, 6, 7, 8, 11]) expect(result.items[index].reviewReasons).toContain("WEIGHT_AMBIGUOUS");
    for (const index of [9, 10]) expect(result.items[index].reviewReasons).toContain("WEIGHT_MISSING");
  });

  it("classifies variety only from explicit title wording", async () => {
    const titles = ["대추방울토마토 1kg", "원형 방울토마토 1kg", "대추 원형 혼합 방울토마토", "완숙 토마토 1kg"];
    const fetcher = fetcherReturning(jsonResponse(body(titles.map((title, i) => item({ title, productId: String(i + 1) })))));
    const result = await search(fetcher as unknown as typeof fetch);
    expect(result.items.map(i => i.varietyGroup)).toEqual(["JUJUBE", "ROUND", "UNKNOWN", "UNKNOWN"]);
    expect(result.items[2].reviewReasons).toContain("VARIETY_CONFLICT");
    expect(result.items[3].reviewReasons).not.toContain("VARIETY_CONFLICT");
  });

  it("marks stevia/juice/powder/processed titles as heuristic exclusions and keeps category doubts as review", async () => {
    const rows = [
      item({ productId: "1", title: "스테비아 대추방울토마토 1kg" }),
      item({ productId: "2", title: "방울토마토 착즙 주스 1L" }),
      item({ productId: "3", title: "토마토 분말 100g" }),
      item({ productId: "4", title: "건조 방울토마토 200g" }),
      item({ productId: "5", title: "방울토마토 모종 10개" }),
      item({ productId: "6", title: "방울토마토 1kg", category2: "가공식품" }),
      item({ productId: "7", title: "방울토마토 1kg", productType: "4" }),
      item({ productId: "8", title: "방울토마토 1kg" }),
    ];
    const result = await search(fetcherReturning(jsonResponse(body(rows))) as unknown as typeof fetch);
    const [stevia, juice, powder, dried, seedling, category, used, plain] = result.items;
    expect(stevia.excluded).toBe(true);
    expect(stevia.reviewReasons).toContain("HEURISTIC_STEVIA");
    expect(juice.reviewReasons).toContain("HEURISTIC_JUICE");
    expect(powder.reviewReasons).toContain("HEURISTIC_POWDER");
    expect(dried.reviewReasons).toContain("HEURISTIC_PROCESSED");
    expect(seedling.reviewReasons).toContain("HEURISTIC_PROCESSED");
    expect([juice, powder, dried, seedling].every(i => i.excluded)).toBe(true);
    expect(category.excluded).toBe(false);
    expect(category.reviewReasons).toContain("CATEGORY_REVIEW");
    expect(used.excluded).toBe(false);
    expect(used.reviewReasons).toContain("PRODUCT_TYPE_NOT_GENERAL");
    expect(plain.excluded).toBe(false);
    expect(plain.reviewReasons).toEqual(["VERIFY_PRICE_OPTION_SHIPPING", "WEIGHT_PROPOSED_FROM_TITLE"]);
    expect(result.excludedCount).toBe(5);
  });

  it("returns an empty result for zero hits", async () => {
    const result = await search(fetcherReturning(jsonResponse(body([], 0))) as unknown as typeof fetch);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.excludedCount).toBe(0);
  });
});

describe("helpers", () => {
  it("cleanShoppingText handles numeric/hex entities, unknown entities, and control characters", () => {
    expect(cleanShoppingText("a&#x41;&unknown;b\u0001c &#0;")).toBe("aA&unknown;b c &#0;");
    expect(cleanShoppingText("x".repeat(400)).length).toBe(300);
  });

  it("sanitizeShoppingUrl and extractSmartstoreKey reject malformed input", () => {
    expect(sanitizeShoppingUrl("not a url")).toBeNull();
    expect(sanitizeShoppingUrl("https://user@host/x")).toBeNull();
    expect(sanitizeShoppingUrl(" https://host/x ")).toBe("https://host/x");
    expect(extractSmartstoreKey(null)).toBeNull();
    expect(extractSmartstoreKey("https://smartstore.naver.com/main/products/1")).toBeNull();
    expect(extractSmartstoreKey("https://smartstore.naver.com/x/products/1")).toBeNull();
  });

  it("proposePackageWeight and classifyVariety expose review reasons", () => {
    expect(proposePackageWeight("토마토 2kg")).toEqual({ kg: 2, reason: "WEIGHT_PROPOSED_FROM_TITLE" });
    expect(proposePackageWeight("토마토 0g")).toEqual({ kg: null, reason: "WEIGHT_AMBIGUOUS" });
    expect(classifyVariety("대추")).toEqual({ group: "JUJUBE", conflict: false });
  });
});
