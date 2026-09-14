import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALLOWED_HOSTS, CAPTURE_LIMITS, ENVELOPE_SCHEMA_VERSION, buildEnvelope, captureVisibleProduct, normalizeProductUrl,
} from "../../../browser-extension/competitor-capture/capture.js";
import { PACKAGED_FILES, listZipEntries, packageExtension } from "../../../scripts/package-competitor-extension.mjs";

const EXTENSION_DIR = path.resolve(__dirname, "../../../browser-extension/competitor-capture");
const PACKAGE_SCRIPT = path.resolve(__dirname, "../../../scripts/package-competitor-extension.mjs");
const readSource = (name: string) => fs.readFileSync(path.join(EXTENSION_DIR, name), "utf8");
const PRODUCT_URL = "https://brand.naver.com/jbn/products/5618807799";

// Shape observed on 2026-09-14 (brand.naver.com/jbn/products/5618807799) after selecting 중과 2kg, wrapped in a page skeleton.
const PURCHASE_PANEL = `
  <aside id="panel">
    <h3>(농할) 국내산 대추 방울토마토 토마토 2kg 실중량</h3>
    <div><a href="#review">8,407건 리뷰</a></div>
    <div><span>16,500</span><span>원</span></div>
    <div>쿠폰 적용가 <strong>16,000원</strong></div>
    <div>무료배송</div>
    <div><p>옵션 선택</p><ul><li>소과 2kg</li><li>중과 2kg (+2,000원)</li><li>대과 2kg (+4,400원)</li></ul></div>
    <div><span>N.대추방울토마토 중과 2kg</span><button>삭제</button><p>수량</p><p>1</p><p>18,500원</p></div>
    <div><span>총 상품금액</span> <strong>18,500원</strong></div>
    <div><span>총 금액</span><em>18,500원</em></div>
    <div><button>선물하기</button><button>구매하기</button><button>톡톡문의</button><button>장바구니</button></div>
    <div class="hidden-hint">숨김 캐시가 12,000원</div>
    <script type="application/ld+json">{"@type":"Product","offers":{"price":"9999"}}</script>
    <template><p>템플릿 가격 1원</p></template>
    <span hidden>hidden 속성 5,000원</span>
    <span style="display:none">인라인 숨김 4,000원</span>
    <span style="visibility:hidden">보이지 않음 3,000원</span>
  </aside>`;
const PAGE = `
  <style>.hidden-hint { display: none } .invisible { visibility: hidden }</style>
  <header><nav><a href="#">홈</a><a href="#">로그인</a><a href="#">장바구니</a><span>홍길동님 안녕하세요</span></nav></header>
  <main>
    <section id="gallery"><img alt="상품 이미지"><p>대표 이미지 설명 텍스트</p></section>
    ${PURCHASE_PANEL}
    <section id="detail"><h2>상세정보</h2><p>${"국내산 대추 방울토마토를 당일 수확해 보내드립니다. ".repeat(40)}</p></section>
    <section id="reviews"><h2>리뷰 1,234건</h2><p>구매평 평점 4.9 별점</p><p>정말 맛있어요 19,000원에 샀어요</p></section>
  </main>
  <footer><p>사업자 정보 · 이용약관 · 개인정보처리방침</p></footer>`;

const select = (start: Node, end: Node) => {
  const range = document.createRange();
  range.setStartBefore(start);
  range.setEndAfter(end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const okCapture = (result: ReturnType<typeof captureVisibleProduct>) => {
  if (!result.ok) throw new Error(`expected ok capture, got ${result.code}: ${result.message}`);
  return result;
};

describe("manifest and permissions", () => {
  const manifest = JSON.parse(readSource("manifest.json")) as Record<string, unknown>;
  it("declares only activeTab, scripting and clipboardWrite on MV3", () => {
    expect(manifest.manifest_version).toBe(3);
    expect([...(manifest.permissions as string[])].sort()).toEqual(["activeTab", "clipboardWrite", "scripting"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.background).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(readSource("manifest.json")).not.toContain("all_urls");
    expect((manifest.action as { default_popup: string }).default_popup).toBe("popup.html");
  });
  it("ships no network, storage, cookie, timer or persistence code", () => {
    const source = readSource("capture.js") + readSource("popup.js") + readSource("popup.html");
    for (const banned of ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "chrome.cookies", "document.cookie", "chrome.storage", "localStorage", "sessionStorage", "indexedDB", "chrome.alarms", "setInterval", "chrome.runtime.onInstalled", "console.log", "<script>", "eval("]) {
      expect(source, banned).not.toContain(banned);
    }
    expect(readSource("popup.html")).toContain('type="module" src="popup.js"');
    expect(readSource("popup.js")).toMatch(/import \{[^}]*captureVisibleProduct[^}]*\} from "\.\/capture\.js"/);
    expect(readSource("popup.js")).toContain("func: captureVisibleProduct");
  });
  it("keeps the injected extractor self-contained (no module-scope references)", () => {
    const body = captureVisibleProduct.toString();
    for (const moduleSymbol of ["CAPTURE_LIMITS", "ALLOWED_HOSTS", "normalizeProductUrl", "buildEnvelope", "ENVELOPE_SCHEMA_VERSION", "import", "require("]) {
      expect(body, moduleSymbol).not.toContain(moduleSymbol);
    }
    expect(body.startsWith("function captureVisibleProduct(")).toBe(true);
  });
});

describe("normalizeProductUrl", () => {
  it("accepts exact hosts and strips tracking queries, fragments and slug case", () => {
    expect(normalizeProductUrl("https://smartstore.naver.com/MyStore/products/123?NaPm=ct%3Dabc&utm_source=x#detail")).toBe("https://smartstore.naver.com/mystore/products/123");
    expect(normalizeProductUrl("https://brand.naver.com/jbn/products/5618807799/")).toBe("https://brand.naver.com/jbn/products/5618807799");
    expect(normalizeProductUrl("https://SMARTSTORE.naver.com/store-1/products/9")).toBe("https://smartstore.naver.com/store-1/products/9");
    expect(ALLOWED_HOSTS).toEqual(["smartstore.naver.com", "brand.naver.com"]);
  });
  it.each([
    ["look-alike host", "https://smartstore.naver.com.evil.com/store/products/1"],
    ["subdomain", "https://m.smartstore.naver.com/store/products/1"],
    ["host in path", "https://evil.com/smartstore.naver.com/store/products/1"],
    ["http", "http://smartstore.naver.com/store/products/1"],
    ["credentials", "https://user:pw@smartstore.naver.com/store/products/1"],
    ["username only", "https://user@smartstore.naver.com/store/products/1"],
    ["port", "https://smartstore.naver.com:8443/store/products/1"],
    ["reserved slug", "https://smartstore.naver.com/products/products/1"],
    ["search page", "https://smartstore.naver.com/store/search?q=x"],
    ["store home", "https://smartstore.naver.com/store"],
    ["non-numeric id", "https://smartstore.naver.com/store/products/abc"],
    ["path traversal", "https://smartstore.naver.com/store/products/1/../../admin"],
    ["javascript", "javascript:alert(1)"],
    ["chrome page", "chrome://extensions"],
    ["empty", ""],
    ["garbage", "not a url"],
  ])("rejects %s", (_label, value) => {
    expect(normalizeProductUrl(value)).toBeNull();
  });
});

describe("captureVisibleProduct", () => {
  beforeEach(() => {
    document.title = "  (농할) 국내산 대추 방울토마토 : 제이비엔 브랜드스토어  ";
    document.body.innerHTML = PAGE;
  });
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("prefers the user's selection and clips it to the selected nodes", () => {
    const panel = document.getElementById("panel")!;
    select(panel.querySelector("h3")!, panel.querySelector("em")!);
    const result = okCapture(captureVisibleProduct());
    expect(result.method).toBe("selection");
    expect(result.title).toBe("(농할) 국내산 대추 방울토마토 : 제이비엔 브랜드스토어");
    expect(result.text.split("\n")).toEqual([
      "(농할) 국내산 대추 방울토마토 토마토 2kg 실중량", "8,407건 리뷰", "16,500원", "쿠폰 적용가 16,000원", "무료배송", "옵션 선택", "소과 2kg", "중과 2kg (+2,000원)", "대과 2kg (+4,400원)",
      "N.대추방울토마토 중과 2kg", "삭제", "수량", "1", "18,500원", "총 상품금액 18,500원", "총 금액18,500원",
    ]);
    expect(result.text).not.toContain("구매평");
    expect(result.text).not.toContain("로그인");
  });

  it("falls back to the bounded product region when nothing is selected", () => {
    const result = okCapture(captureVisibleProduct());
    expect(result.method).toBe("product-region");
    expect(result.text).toContain("(농할) 국내산 대추 방울토마토 토마토 2kg 실중량");
    expect(result.text).toContain("총 금액18,500원");
    expect(result.text).toContain("중과 2kg (+2,000원)");
    for (const excluded of ["리뷰 1,234건", "구매평", "로그인", "홍길동", "상세정보", "사업자 정보", "대표 이미지"]) expect(result.text, excluded).not.toContain(excluded);
    expect(result.text.length).toBeLessThanOrEqual(CAPTURE_LIMITS.region);
  });

  it("stops at the smallest bounded ancestor that shows the product heading (live DOM shape)", () => {
    // Live sample 2026-09-14 (smartstore.naver.com/jwfruit/products/10092149919): h3 → parent → parent is the purchase panel.
    document.body.innerHTML = `<header><p>로그인</p><p>장바구니</p></header><main><div id="wrap"><p>관련 상품 9,900원</p><div id="panel"><div><h3>대추방울토마토</h3><p>8,407건 리뷰</p></div>
      <p>14,900원</p><p>무료배송</p><p>옵션 선택 (필수)</p><p>대추방울토마토</p><p>상품명</p><p>2kg 1~2번 중대과 로얄과</p><p>16,400원</p><p>총 1개</p>
      <div><span>총 금액</span><span>도움말</span><span>16,400원</span></div><p>선물하기 구매하기 찜 하기 톡톡문의 장바구니</p></div></div>
      <section>${"<p>상세 설명 문단입니다.</p>".repeat(30)}</section><section><p>구매평 아주 좋아요 별점 5</p></section></main>`;
    const result = okCapture(captureVisibleProduct());
    expect(result.method).toBe("product-region");
    expect(result.text.startsWith("대추방울토마토\n8,407건 리뷰\n14,900원")).toBe(true);
    expect(result.text).toContain("총 금액도움말16,400원");
    expect(result.text).not.toContain("관련 상품");
    expect(result.text).not.toContain("구매평");
  });

  it("never reads hidden nodes, scripts, JSON-LD or templates in either method", () => {
    const region = okCapture(captureVisibleProduct()).text;
    const panel = document.getElementById("panel")!;
    select(panel.firstElementChild!, panel.lastElementChild!);
    const selected = okCapture(captureVisibleProduct()).text;
    for (const text of [region, selected]) {
      for (const hidden of ["12,000원", "9999", "템플릿", "5,000원", "4,000원", "3,000원", "ld+json"]) expect(text, hidden).not.toContain(hidden);
    }
  });

  it("ignores a selection that lies entirely inside hidden content and falls back", () => {
    const hidden = document.querySelector(".hidden-hint")!;
    select(hidden, hidden);
    const result = okCapture(captureVisibleProduct());
    expect(result.method).toBe("product-region");
    expect(result.text).not.toContain("12,000원");
  });

  it("refuses when the total label sits in an unbounded DOM (whole page as one flat block)", () => {
    document.body.innerHTML = `<div>${["로그인", "홍길동님", "상품명 A", "16,500원", "총 금액 18,500원", "리뷰 1,234건", "구매평 아주 좋아요", "사업자 정보"].map(t => `<span>${t}</span>`).join(" ")}</div>`;
    const result = captureVisibleProduct();
    expect(result).toMatchObject({ ok: false, code: "region-unbounded" });
  });

  it("refuses when the smallest priced ancestor already spans most of the page", () => {
    document.body.innerHTML = `<div><h1>상품</h1><p>16,500원</p><p><span>총 금액</span> 18,500원</p></div><footer>약관</footer>`;
    const result = captureVisibleProduct();
    expect(result).toMatchObject({ ok: false, code: "region-unbounded" });
  });

  it("does not choose a region that contains reviews or account identity", () => {
    document.body.innerHTML = `<header>${"<p>메뉴</p>".repeat(20)}</header><section><div><p>상품 A</p><p>총 금액 18,500원</p><p>마이페이지 · 로그아웃</p></div></section>${"<p>푸터 안내 문구입니다.</p>".repeat(20)}`;
    expect(captureVisibleProduct()).toMatchObject({ ok: false, code: "region-unbounded" });
  });

  it("reports a clear failure on login, captcha or restricted pages without bypassing", () => {
    document.body.innerHTML = `<form><h1>로그인이 필요한 서비스입니다</h1><input type="password"><button>로그인</button></form>`;
    expect(captureVisibleProduct()).toMatchObject({ ok: false, code: "access-restricted" });
    document.body.innerHTML = `<div><p>보안 확인을 위해 자동 입력 방지 문자를 입력하세요</p><img alt="captcha"></div>`;
    expect(captureVisibleProduct()).toMatchObject({ ok: false, code: "access-restricted" });
  });

  it("reports region-not-found when no total label is visible", () => {
    document.body.innerHTML = `<div><h1>상품 A</h1><p>16,500원</p><p class="hidden-hint">총 금액 18,500원</p></div><style>.hidden-hint{display:none}</style>`;
    expect(captureVisibleProduct()).toMatchObject({ ok: false, code: "region-not-found" });
  });

  it("refuses an oversized selection instead of truncating", () => {
    document.body.innerHTML = `<div id="big"><p>${"가격 18,500원 ".repeat(3200)}</p><p>총 금액 18,500원</p></div>`;
    const big = document.getElementById("big")!;
    select(big.firstElementChild!, big.lastElementChild!);
    const result = captureVisibleProduct();
    expect(result).toMatchObject({ ok: false, code: "oversized" });
  });

  it("truncates the title to 200 characters", () => {
    document.title = "제".repeat(400);
    expect(okCapture(captureVisibleProduct()).title).toHaveLength(CAPTURE_LIMITS.title);
  });
});

describe("buildEnvelope", () => {
  const capture = { ok: true as const, method: "selection" as const, title: "제목", text: "총 금액 18,500원\n무료배송" };
  const capturedAt = "2026-09-14T03:21:45.000Z";

  it("produces exactly the documented envelope keys", () => {
    const built = buildEnvelope({ capture, productUrl: PRODUCT_URL, capturedAt });
    if (!built.ok) throw new Error(built.message);
    expect(built.envelope).toEqual({ schemaVersion: ENVELOPE_SCHEMA_VERSION, productUrl: PRODUCT_URL, capturedAt, title: "제목", text: capture.text, method: "selection" });
    expect(Object.keys(built.envelope)).toEqual(["schemaVersion", "productUrl", "capturedAt", "title", "text", "method"]);
    expect(ENVELOPE_SCHEMA_VERSION).toBe("retirefarm-visible-product-v1");
    expect(JSON.parse(built.json)).toEqual(built.envelope);
  });
  it("passes capture failures through and rejects non-canonical URLs or bad times", () => {
    expect(buildEnvelope({ capture: { ok: false, code: "region-unbounded", message: "x" }, productUrl: PRODUCT_URL, capturedAt })).toMatchObject({ ok: false, code: "region-unbounded" });
    expect(buildEnvelope({ capture, productUrl: `${PRODUCT_URL}?utm_source=x`, capturedAt })).toMatchObject({ ok: false, code: "bad-url" });
    expect(buildEnvelope({ capture, productUrl: "https://evil.com/a/products/1", capturedAt })).toMatchObject({ ok: false, code: "bad-url" });
    expect(buildEnvelope({ capture, productUrl: PRODUCT_URL, capturedAt: "yesterday" })).toMatchObject({ ok: false, code: "bad-time" });
    expect(buildEnvelope({ capture: { ...capture, text: "" }, productUrl: PRODUCT_URL, capturedAt })).toMatchObject({ ok: false, code: "empty" });
  });
  it("enforces text, title and JSON size limits", () => {
    expect(buildEnvelope({ capture: { ...capture, text: "a".repeat(CAPTURE_LIMITS.text + 1) }, productUrl: PRODUCT_URL, capturedAt })).toMatchObject({ ok: false, code: "oversized" });
    const titled = buildEnvelope({ capture: { ...capture, title: "t".repeat(500) }, productUrl: PRODUCT_URL, capturedAt });
    expect(titled.ok && titled.envelope.title.length).toBe(CAPTURE_LIMITS.title);
    // 29,000 newlines escape to 58,000 JSON characters: within the text limit but beyond the JSON limit.
    expect(buildEnvelope({ capture: { ...capture, text: "\n".repeat(29000) }, productUrl: PRODUCT_URL, capturedAt })).toMatchObject({ ok: false, code: "oversized-json" });
    expect(CAPTURE_LIMITS).toMatchObject({ text: 30000, title: 200, json: 40000 });
  });
});

describe("package script", () => {
  it("builds a reproducible source-only ZIP with manifest.json at the root", () => {
    const first = packageExtension();
    const second = packageExtension();
    expect(first.equals(second)).toBe(true);
    const entries = listZipEntries(first);
    expect(entries).toEqual([...PACKAGED_FILES]);
    expect(entries).toContain("manifest.json");
    expect(entries.every(name => !name.includes("/") && !name.includes("node_modules") && !name.endsWith(".test.ts"))).toBe(true);
    expect(fs.readdirSync(EXTENSION_DIR).filter(name => !name.startsWith(".")).sort()).toEqual([...PACKAGED_FILES]);
  });
  it("writes the archive to the requested path from the CLI", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "retirefarm-ext-"));
    const out = path.join(dir, "nested", "retirefarm-competitor-capture.zip");
    try {
      const stdout = execFileSync(process.execPath, [PACKAGE_SCRIPT, "--out", out], { encoding: "utf8" });
      expect(stdout).toContain("Packaged 7 files");
      expect(fs.readFileSync(out).equals(packageExtension())).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

it("refuses extraction when a tab navigated away from the requested product", () => {
  expect(captureVisibleProduct(PRODUCT_URL)).toMatchObject({ ok: false, code: "page-changed" });
});

it("rejects whole-page and identity-containing selections", () => {
  document.body.innerHTML = PAGE;
  select(document.body.firstElementChild!, document.body.lastElementChild!);
  expect(captureVisibleProduct()).toMatchObject({ ok: false, code: "selection-unbounded" });
  document.body.innerHTML = `<p id="identity">로그아웃 마이페이지</p><p>${"상품 안내 ".repeat(100)}</p>`;
  const identity = document.getElementById("identity")!;
  select(identity, identity);
  expect(captureVisibleProduct()).toMatchObject({ ok: false, code: "selection-unbounded" });
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

it("parses the actual inline help pattern emitted by capture traversal", async () => {
  const { parseVisiblePage } = await import("@/components/reports/competitor/parse-visible-page");
  expect(parseVisiblePage("상품명\n2kg 중대과\n16,400원\n총 1개\n총 금액도움말16,400원")).toMatchObject({ price: 16400, optionLabel: "2kg 중대과" });
});
