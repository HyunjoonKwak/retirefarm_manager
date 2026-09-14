// Visible-product capture for the Retirefarm competitor panel.
// `captureVisibleProduct` is injected verbatim via chrome.scripting.executeScript({ func }),
// so it must stay self-contained: no imports, no module-scope references, no async.
// Everything else in this file runs only in the extension popup (or in tests).

export const ENVELOPE_SCHEMA_VERSION = "retirefarm-visible-product-v1";
export const CAPTURE_LIMITS = Object.freeze({ text: 30000, title: 200, json: 40000, region: 4000 });
export const ALLOWED_HOSTS = Object.freeze(["smartstore.naver.com", "brand.naver.com"]);

const PRODUCT_PATH = /^\/([a-z0-9_-]{2,64})\/products\/(\d+)\/?$/i;
const RESERVED_SLUGS = ["products", "main", "inflow", "category", "search", "api"];

/**
 * Exact https Naver smartstore/brand product URL with no credentials or port; every query
 * string and fragment (NaPm, utm_*, etc.) is dropped. Returns null for anything else.
 * @param {string} value
 * @returns {string | null}
 */
export function normalizeProductUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { return null; }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.includes(url.hostname) || url.port !== "" || url.username !== "" || url.password !== "") return null;
  const match = PRODUCT_PATH.exec(url.pathname);
  if (!match) return null;
  const slug = match[1].toLowerCase();
  if (RESERVED_SLUGS.includes(slug)) return null;
  return `https://${url.hostname}/${slug}/products/${match[2]}`;
}

/**
 * Runs inside the product tab. Prefers the user's visible selection; otherwise bounds the
 * visible purchase region around a "총 금액" label. Never reads scripts, JSON-LD, hidden
 * nodes, storage, cookies or the network, and never copies the whole page.
 * @param {string} [expectedProductUrl] Current canonical URL required by the popup injection.
 * @returns {{ ok: true, method: "selection" | "product-region", title: string, text: string }
 *   | { ok: false, code: string, message: string }}
 */
export function captureVisibleProduct(expectedProductUrl) {
  const MAX_TEXT = 30000;
  const MAX_TITLE = 200;
  const MAX_REGION = 4000;
  const MAX_REGION_SHARE = 0.8;
  const MIN_REGION_LINES = 2;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "IFRAME", "SVG", "TEXTAREA", "SELECT", "OPTION", "INPUT", "CANVAS", "VIDEO", "AUDIO", "OBJECT", "EMBED", "META", "LINK", "TITLE"]);
  const BLOCK_TAGS = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "BUTTON", "DD", "DETAILS", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LABEL", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL"]);
  const TOTAL_RE = /총\s*(상품\s*)?금액/;
  const PRICE_RE = /\d[\d,]*\s*원/;
  // Review bodies only: the purchase panel itself shows a review count ("8,407건 리뷰"), which must stay allowed.
  const REVIEW_RE = /(구매평|상품평|별점|후기|리뷰\s*작성|리뷰\s*더보기|포토\s*리뷰)/;
  const IDENTITY_RE = /(로그아웃|마이페이지|내\s*정보|회원정보|주문내역|배송지\s*관리)/;
  const RESTRICTED_RE = /(로그인이\s*필요|로그인\s*후|로그인\s*해\s*주|captcha|보안\s*확인|자동\s*입력\s*방지|접근이\s*제한|접근\s*권한|판매\s*중지|페이지를\s*찾을\s*수\s*없)/i;

  const doc = document;
  if (expectedProductUrl !== undefined) {
    const current = new URL(doc.location.href);
    const path = /^\/([a-z0-9_-]{2,64})\/products\/(\d+)\/?$/i.exec(current.pathname);
    const canonical = path && current.protocol === "https:" && !current.username && !current.password && !current.port
      && ["smartstore.naver.com", "brand.naver.com"].includes(current.hostname)
      ? `${current.origin}/${path[1].toLowerCase()}/products/${path[2]}` : null;
    if (!canonical || canonical !== expectedProductUrl) return { ok: false, code: "page-changed", message: "상품 주소가 바뀌었습니다. 확장을 다시 열어 현재 상품을 확인해 주세요." };
  }
  const view = doc.defaultView;
  if (!doc.body || !view) return { ok: false, code: "no-document", message: "문서를 읽을 수 없습니다." };
  // jsdom and other layout-less hosts report no client rects for anything; only trust rects when the body has one.
  const layoutAvailable = doc.body.getClientRects().length > 0;
  const hiddenCache = new Map();

  const isHidden = (el) => {
    const cached = hiddenCache.get(el);
    if (cached !== undefined) return cached;
    let hidden = SKIP_TAGS.has(el.tagName) || el.hasAttribute("hidden");
    let display = "";
    if (!hidden) {
      const style = view.getComputedStyle(el);
      display = style.display;
      hidden = display === "none" || style.visibility === "hidden" || style.visibility === "collapse";
    }
    if (!hidden && layoutAvailable && display !== "contents" && el.tagName !== "BR" && el.getClientRects().length === 0) hidden = true;
    hiddenCache.set(el, hidden);
    return hidden;
  };
  const isBlock = (el) => BLOCK_TAGS.has(el.tagName) || /^(block|flex|grid|table|list-item|flow-root)/.test(view.getComputedStyle(el).display);
  const ancestorsVisible = (el) => {
    for (let node = el; node && node !== doc.documentElement; node = node.parentElement) if (isHidden(node)) return false;
    return true;
  };

  /** Collects rendered text of `root`, optionally clipped to `range`, and reports text nodes carrying the total label. */
  const collect = (root, range) => {
    const parts = [];
    const anchors = [];
    const visit = (node) => {
      if (node.nodeType === 3) {
        if (range && !range.intersectsNode(node)) return;
        let data = node.data;
        if (range && node === range.endContainer) data = data.slice(0, range.endOffset);
        if (range && node === range.startContainer) data = data.slice(range.startOffset);
        const text = data.replace(/\s+/g, " ");
        // Whitespace-only nodes still separate inline runs ("총 상품금액" <strong>); line trimming drops the rest.
        if (text.trim() !== "" && TOTAL_RE.test(text) && node.parentElement) anchors.push(node.parentElement);
        parts.push(text);
        return;
      }
      if (node.nodeType !== 1 || isHidden(node)) return;
      if (range && !range.intersectsNode(node)) return;
      const block = isBlock(node);
      if (block) parts.push("\n");
      for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
      if (block) parts.push("\n");
    };
    visit(root);
    const text = parts.join("").split("\n").map(line => line.replace(/ {2,}/g, " ").trim()).filter(line => line !== "").join("\n");
    return { text, anchors };
  };

  const title = (doc.title || "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
  const finish = (method, text) => text.length > MAX_TEXT
    ? { ok: false, code: "oversized", message: `캡처한 텍스트가 ${MAX_TEXT.toLocaleString()}자를 넘습니다. 가격·옵션 영역만 선택해 주세요.` }
    : { ok: true, method, title, text };

  const body = collect(doc.body, null);
  const selection = view.getSelection();
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const root = container.nodeType === 1 ? container : container.parentElement;
    if (root && doc.body.contains(root) && ancestorsVisible(root)) {
      const { text } = collect(root, range);
      if (text.length > MAX_TEXT) return finish("selection", text);
      if (text && (text.length >= body.text.length * MAX_REGION_SHARE || IDENTITY_RE.test(text) || REVIEW_RE.test(text) || RESTRICTED_RE.test(text)))
        return { ok: false, code: "selection-unbounded", message: "선택에 페이지 전체·계정 정보·리뷰 또는 접근 제한 안내가 포함돼 있습니다. 상품 옵션·가격 영역만 선택해 주세요." };
      if (text && (!TOTAL_RE.test(text) || !PRICE_RE.test(text)))
        return { ok: false, code: "selection-no-price", message: "선택한 영역에 총 금액이 없습니다. 옵션과 총 금액을 함께 선택해 주세요." };
      if (text !== "") return finish("selection", text);
    }
  }

  if (body.anchors.length === 0) {
    return RESTRICTED_RE.test(body.text)
      ? { ok: false, code: "access-restricted", message: "로그인·보안 확인 또는 접근 제한 페이지로 보여 캡처하지 않았습니다. 상품 페이지가 정상 표시된 뒤 다시 시도해 주세요." }
      : { ok: false, code: "region-not-found", message: "화면에서 '총 금액' 영역을 찾지 못했습니다. 옵션을 선택한 뒤 가격 영역을 드래그로 선택하고 다시 캡처해 주세요." };
  }

  // Climb from the total label; stop at the smallest bounded ancestor that also shows the product heading
  // (observed live: h3 → parent → parent = purchase panel), else keep the largest bounded ancestor.
  const hasVisibleHeading = (el) => Array.from(el.querySelectorAll("h1, h2, h3")).some(heading => ancestorsVisible(heading));
  let region = null;
  for (let el = body.anchors[0]; el && el !== doc.body; el = el.parentElement) {
    const { text } = collect(el, null);
    if (text.length > MAX_REGION || REVIEW_RE.test(text) || IDENTITY_RE.test(text)) break;
    // A lone total line is not a product region; keep climbing until options/title context is included.
    if (!PRICE_RE.test(text) || text.split("\n").length < MIN_REGION_LINES) continue;
    region = text;
    if (hasVisibleHeading(el)) break;
  }
  if (region === null || region.length > body.text.length * MAX_REGION_SHARE) {
    return { ok: false, code: "region-unbounded", message: "가격 영역을 확실히 구분할 수 없어 캡처하지 않았습니다. 가격·옵션 영역만 드래그로 선택한 뒤 다시 캡처해 주세요." };
  }
  return finish("product-region", region);
}

/**
 * Wraps a successful capture in the exact export envelope, enforcing every size limit.
 * @param {{ capture: ReturnType<typeof captureVisibleProduct>, productUrl: string, capturedAt: string }} input
 * @returns {{ ok: true, envelope: { schemaVersion: string, productUrl: string, capturedAt: string, title: string, text: string, method: "selection" | "product-region" }, json: string }
 *   | { ok: false, code: string, message: string }}
 */
export function buildEnvelope({ capture, productUrl, capturedAt }) {
  if (!capture || capture.ok !== true) return { ok: false, code: capture?.code ?? "capture-failed", message: capture?.message ?? "캡처 결과가 없습니다." };
  if (!normalizeProductUrl(productUrl) || normalizeProductUrl(productUrl) !== productUrl) return { ok: false, code: "bad-url", message: "지원하지 않는 상품 주소입니다." };
  if (Number.isNaN(Date.parse(capturedAt))) return { ok: false, code: "bad-time", message: "캡처 시각이 올바르지 않습니다." };
  if (capture.method !== "selection" && capture.method !== "product-region") return { ok: false, code: "bad-method", message: "캡처 방식이 올바르지 않습니다." };
  const title = String(capture.title ?? "").slice(0, CAPTURE_LIMITS.title);
  const text = String(capture.text ?? "");
  if (text === "") return { ok: false, code: "empty", message: "캡처한 텍스트가 비어 있습니다." };
  if (text.length > CAPTURE_LIMITS.text) return { ok: false, code: "oversized", message: `텍스트가 ${CAPTURE_LIMITS.text.toLocaleString()}자를 넘습니다.` };
  const envelope = { schemaVersion: ENVELOPE_SCHEMA_VERSION, productUrl, capturedAt: new Date(capturedAt).toISOString(), title, text, method: capture.method };
  const json = JSON.stringify(envelope);
  if (json.length > CAPTURE_LIMITS.json) return { ok: false, code: "oversized-json", message: `JSON이 ${CAPTURE_LIMITS.json.toLocaleString()}자를 넘습니다. 더 좁은 영역을 선택해 주세요.` };
  return { ok: true, envelope, json };
}
