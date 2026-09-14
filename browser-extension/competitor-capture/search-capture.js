// Public rendered search cards only. No network, hydration state, cookies or hidden JSON.
// Card shape follows the accessibility tree observed on search.shopping.naver.com/ns/search on 2026-09-14
// (unit-tested against a DOM replica; not yet validated inside an installed extension).
export const SEARCH_SCHEMA_VERSION = "retirefarm-visible-search-v1";
export const SEARCH_CARD_LIMIT = 20;

/**
 * Mirrors normalizeDiscoverySourceUrl in src/lib/briefing/discovery-contracts.ts: exact host, /search/all or /ns/search,
 * only query/sort/pagingIndex in that order, duplicated meaningful params rejected, query casefolded and whitespace-collapsed.
 * Kept in plain JS because the popup cannot import TypeScript; the copy inside captureVisibleSearch must stay identical.
 */
export function normalizeSearchUrl(value) {
  try {
    const u = new URL(String(value).trim());
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
    if (u.protocol !== "https:" || u.hostname !== "search.shopping.naver.com" || u.port || u.username || u.password || !["/search/all", "/ns/search"].includes(path)) return null;
    if (["query", "sort", "pagingIndex"].some(key => u.searchParams.getAll(key).length > 1)) return null;
    const query = (u.searchParams.get("query") || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!query || query.length > 100) return null;
    const sort = u.searchParams.get("sort");
    if (sort !== null && !/^[a-z0-9_-]{1,40}$/i.test(sort)) return null;
    const paging = u.searchParams.get("pagingIndex");
    if (paging !== null && !(/^\d{1,3}$/.test(paging) && Number(paging) >= 1 && Number(paging) <= 100)) return null;
    const params = new URLSearchParams({ query });
    if (sort !== null) params.set("sort", sort);
    if (paging !== null) params.set("pagingIndex", String(Number(paging)));
    return `https://search.shopping.naver.com${path}?${params}`;
  } catch { return null; }
}

// Must stay self-contained: chrome.scripting serializes this function, not its module scope.
export function captureVisibleSearch(expectedUrl) {
  const normalize = value => {
    try {
      const u = new URL(String(value).trim());
      const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
      if (u.protocol !== "https:" || u.hostname !== "search.shopping.naver.com" || u.port || u.username || u.password || !["/search/all", "/ns/search"].includes(path)) return null;
      if (["query", "sort", "pagingIndex"].some(key => u.searchParams.getAll(key).length > 1)) return null;
      const query = (u.searchParams.get("query") || "").trim().replace(/\s+/g, " ").toLowerCase();
      if (!query || query.length > 100) return null;
      const sort = u.searchParams.get("sort");
      if (sort !== null && !/^[a-z0-9_-]{1,40}$/i.test(sort)) return null;
      const paging = u.searchParams.get("pagingIndex");
      if (paging !== null && !(/^\d{1,3}$/.test(paging) && Number(paging) >= 1 && Number(paging) <= 100)) return null;
      const params = new URLSearchParams({ query });
      if (sort !== null) params.set("sort", sort);
      if (paging !== null) params.set("pagingIndex", String(Number(paging)));
      return `https://search.shopping.naver.com${path}?${params}`;
    } catch { return null; }
  };
  const sourceUrl = normalize(location.href);
  if (!sourceUrl || sourceUrl !== expectedUrl) return { ok: false, code: "page-changed", message: "검색 주소가 바뀌었습니다. 확장을 다시 열어 주세요." };
  if (new URL(sourceUrl).pathname !== "/ns/search") return { ok: false, code: "unsupported-page", message: "현재 검색 수집은 네이버플러스 스토어 검색을 지원합니다. ‘네이버 플러스 쇼핑 검색에서 더보기’로 이동해 주세요." };

  // Visibility is decided per element from computed style plus layout rects; a page without layout exports nothing.
  if (!document.body || document.body.getClientRects().length === 0) return { ok: false, code: "no-layout", message: "화면이 아직 표시되지 않아 수집하지 않았습니다. 페이지가 보이는 상태에서 다시 시도해 주세요." };
  const SKIPPED = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "INPUT", "TEXTAREA", "SELECT", "OPTION"]);
  const styleCache = new Map();
  const hiddenSelf = el => {
    if (styleCache.has(el)) return styleCache.get(el);
    let hidden = SKIPPED.has(el.tagName) || el.hidden || el.getAttribute("aria-hidden") === "true";
    if (!hidden) {
      const s = getComputedStyle(el);
      hidden = s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse" || s.opacity === "0"
        // Screen-reader-only text (clip / 1px boxes) is accessibility copy, not rendered copy.
        || (s.position === "absolute" && (/^rect\(\s*0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?\s*\)$/.test(s.clip) || /^inset\(\s*100%\s*\)$/.test(s.clipPath)
          || (s.overflow === "hidden" && ["0px", "1px"].includes(s.width) && ["0px", "1px"].includes(s.height))));
    }
    styleCache.set(el, hidden);
    return hidden;
  };
  const visible = el => {
    if (!el) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) if (hiddenSelf(p)) return false;
    return el.getClientRects().length > 0;
  };
  // Only text nodes whose every ancestor is visible contribute, so hidden badges or 0-opacity overlays never leak into the copy.
  const text = el => {
    if (!visible(el)) return "";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const parts = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let ok = true;
      for (let p = node.parentElement; p && p !== el; p = p.parentElement) if (hiddenSelf(p)) { ok = false; break; }
      if (ok) parts.push(node.nodeValue);
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };
  const safeUrl = href => {
    try { const u = new URL(href); return u.protocol === "https:" && !u.port && !u.username && !u.password ? u : null; } catch { return null; }
  };
  const RESERVED = ["main", "products", "inflow", "category", "search", "api"];
  const STORE_HOSTS = ["smartstore.naver.com", "brand.naver.com"];
  const cleanProduct = href => {
    const u = safeUrl(href), m = u && /^\/([a-z0-9_-]{2,64})\/products\/(\d+)\/?$/i.exec(u.pathname);
    if (!u || !STORE_HOSTS.includes(u.hostname) || !m || RESERVED.includes(m[1].toLowerCase())) return null;
    return `https://${u.hostname}/${m[1].toLowerCase()}/products/${m[2]}`;
  };
  // Seller root either directly or wrapped once in smartstore's outlink redirect; the redirect itself is never exported.
  const storefront = href => {
    let u = safeUrl(href);
    if (!u || u.hostname !== "smartstore.naver.com" && u.hostname !== "brand.naver.com") return null;
    if (u.hostname === "smartstore.naver.com" && u.pathname === "/inflow/outlink/url") {
      if (u.searchParams.getAll("url").length !== 1) return null;
      u = safeUrl(u.searchParams.get("url"));
    }
    const m = u && /^\/([a-z0-9_-]{2,64})\/?$/i.exec(u.pathname);
    if (!u || !STORE_HOSTS.includes(u.hostname) || !m || RESERVED.includes(m[1].toLowerCase())) return null;
    return `https://${u.hostname}/${m[1].toLowerCase()}`;
  };
  const mainProductId = href => {
    const u = safeUrl(href), m = u && /^\/main\/products\/(\d+)\/?$/.exec(u.pathname);
    return u && u.hostname === "smartstore.naver.com" && m ? m[1] : null;
  };
  const isAdHost = href => { const u = safeUrl(href); return !!u && u.hostname === "ader.naver.com"; };
  const AD_TOKEN = /(?:^|\s)광고(?:\s|$)/;

  // This rendered ID belongs to the basic product card, rather than promotional carousels.
  const INFO = '[id^="basic_product_card_information_"]';
  const cards = Array.from(document.querySelectorAll(INFO)).filter(visible);
  if (!cards.length) {
    // Security checks or access limits are reported as such and never bypassed; the page copy itself is not exported.
    if (/보안 확인|실제 사용자|접근이? 제한|자동 입력 방지|로그인이 필요/.test(text(document.body)))
      return { ok: false, code: "access-restricted", message: "보안 확인 또는 접근 제한 화면이 표시되어 수집하지 않았습니다. 브라우저에서 직접 확인을 마친 뒤 다시 시도해 주세요." };
    return { ok: false, code: "no-cards", message: "지원되는 상품 목록이 없습니다. 로딩·접근 제한 또는 화면 변경 여부를 확인해 주세요." };
  }
  const items = [];
  for (let index = 0; index < Math.min(cards.length, 20); index++) {
    const info = cards[index], card = info.parentElement;
    // Fail closed when the parent groups several cards: the overlay link could then belong to a different product.
    if (!card || card === document.body || card.querySelectorAll(INFO).length !== 1) continue;
    const title = Array.from(info.querySelectorAll("strong")).map(text).find(Boolean);
    const links = Array.from(info.querySelectorAll("a[href]")).filter(visible);
    const sellerLink = links.find(a => storefront(a.href)) || links[0];
    const storeName = sellerLink ? text(sellerLink).replace(/새 창에서 열림|우수셀러|공식/g, "").replace(/\s+/g, " ").trim() : "";
    if (!title || title.length > 300 || !storeName || storeName.length > 100) continue;
    const allLinks = Array.from(card.querySelectorAll("a[href]")).filter(visible);
    const directUrls = new Set(allLinks.map(a => cleanProduct(a.href)).filter(Boolean));
    const mainIds = new Set(allLinks.map(a => mainProductId(a.href)).filter(Boolean));
    const store = sellerLink ? storefront(sellerLink.href) : null;
    // One card must point at exactly one product of the observed seller; anything ambiguous stays unresolved for human review.
    const single = directUrls.size === 1 ? [...directUrls][0] : null;
    const direct = single && (!store || single.startsWith(`${store}/products/`)) ? single : null;
    const proposal = directUrls.size === 0 && store && mainIds.size === 1 ? `${store}/products/${[...mainIds][0]}` : null;
    // Visible accessible labels may carry an ad marker even when a separate ad badge is not rendered.
    const labels = Array.from(card.querySelectorAll("[aria-label]")).filter(visible).map(el => el.getAttribute("aria-label") || "").join(" ");
    const ad = AD_TOKEN.test(`${text(card)} ${labels}`) || allLinks.some(a => isAdHost(a.href));
    const reviewTexts = Array.from(info.querySelectorAll("span,em,div,a")).map(text).map(t => /^리뷰\s*([\d,]{1,12})\s*건?$/.exec(t)).filter(Boolean).map(m => m[1]);
    const reviews = new Set(reviewTexts.map(t => Number(t.replace(/,/g, ""))));
    const reviewCount = reviews.size === 1 && Number.isInteger([...reviews][0]) && [...reviews][0] <= 100000000 ? [...reviews][0] : null;
    // Displayed purchase text is kept verbatim; it is never parsed into a sales figure.
    const purchaseLabel = Array.from(card.querySelectorAll("span,em,div")).map(text).find(t => /^구매\s*[\d,.천만+]+$/.test(t)) || "";
    items.push({ productUrl: direct || proposal, urlStatus: direct ? "DIRECT" : proposal ? "COMPOSED" : "UNRESOLVED", title, storeName,
      position: index + 1, adStatus: ad ? "AD" : "UNKNOWN", purchaseLabel, reviewCount, reviewBasis: "UNKNOWN" });
  }
  if (!items.length) return { ok: false, code: "no-items", message: "상품 제목·판매처를 안전하게 구분하지 못했습니다. 화면 구조를 확인해 주세요." };
  const sortTexts = [...new Set(Array.from(document.querySelectorAll("button")).filter(visible)
    .flatMap(el => [text(el), el.getAttribute("aria-label") || ""])
    .map(value => value.match(/^(추천순|판매 많은순|리뷰 많은순|낮은 가격순|높은 가격순|신상품순)\s*선택(?:됨)?$/)?.[1])
    .filter(Boolean))];
  const searchSort = sortTexts.length === 1 ? sortTexts[0] : "UNKNOWN";
  if (normalize(location.href) !== sourceUrl) return { ok: false, code: "page-changed", message: "수집 중 검색 주소가 바뀌었습니다." };
  return { ok: true, envelope: { schemaVersion: "retirefarm-visible-search-v1", sourceUrl, query: new URL(sourceUrl).searchParams.get("query"),
    capturedAt: new Date().toISOString(), searchSort, searchEnvironment: "BROWSER_UNSPECIFIED", items },
    message: "보이는 상품 목록을 수집했습니다. 비광고 여부·품목·조합한 상품 주소는 앱에서 확인하세요. 위치는 현재 화면 목록의 순서입니다." };
}
