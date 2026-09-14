// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const m = vi.hoisted(() => ({ db: null as unknown as PrismaClient, user: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: new Proxy({}, { get: (_, key) => {
  const value = Reflect.get(m.db, key); return typeof value === "function" ? value.bind(m.db) : value;
} }) }));
vi.mock("@/lib/auth/guards", () => ({ getSessionUser: m.user }));
import { canonicalProductUrl, competitorOverview, mutateCompetitors } from "@/lib/briefing/competitors";
import { competitorRequestSchema, type CompetitorRequest } from "@/lib/briefing/competitor-contracts";
import { BriefingError } from "@/lib/briefing/queue";
import { GET, POST } from "@/app/api/briefings/competitors/route";

let dir: string;
const now = new Date("2026-09-14T03:00:00.000Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(now.getTime() - ms);
const product = (store: string, id = 1) => `https://smartstore.naver.com/${store}/products/${id}`;
const panel = (store: string, overrides: Partial<Extract<CompetitorRequest, { action: "addPanel" }>> = {}): CompetitorRequest => ({
  action: "addPanel", storeName: `${store} 농장`, productUrl: product(store), productName: "토마토", varietyGroup: "JUJUBE",
  qualityGroup: "REGULAR", optionLabel: "2kg 1박스", packageKg: 2, confirmed: true, ...overrides });
const record = (entryId: string, overrides: Partial<Extract<CompetitorRequest, { action: "record" }>> = {}): CompetitorRequest => ({
  action: "record", entryId, observedAt: ago(DAY).toISOString(), price: 12000, shippingFee: 3000, availability: "IN_STOCK", ...overrides });
// Requests pass through the route schema so service tests see exactly what the API hands over (trim, strict keys).
const search = (query = "대추방울토마토"): CompetitorRequest => competitorRequestSchema.parse({ action: "search", query });
const naverBody = (items: Record<string, unknown>[] = []) => ({ lastBuildDate: "x", total: items.length, start: 1, display: items.length, items });
const naverItem = (id: string, store: string) => ({ productId: id, title: `<b>대추방울토마토</b> 2kg`, link: product(store), lprice: "12900",
  mallName: `${store} 농장`, productType: "2", category1: "식품" });
const okResponse = (items: Record<string, unknown>[] = [naverItem("1", "farm-a")]) =>
  new Response(JSON.stringify(naverBody(items)), { status: 200, headers: { "content-type": "application/json" } });
const rejects = (promise: Promise<unknown>, status: number, pattern?: RegExp) =>
  promise.then(() => { throw new Error("expected rejection"); }, (error: unknown) => {
    expect(error).toBeInstanceOf(BriefingError); expect((error as BriefingError).status).toBe(status);
    if (pattern) expect((error as BriefingError).message).toMatch(pattern);
  });
async function add(userId: string, store: string, overrides: Partial<Extract<CompetitorRequest, { action: "addPanel" }>> = {}) {
  const result = await mutateCompetitors(userId, panel(store, overrides), now);
  return (result as { id: string }).id;
}
const post = (body: unknown) => POST(new Request("http://localhost/api/briefings/competitors", { method: "POST",
  body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(async () => {
  vi.clearAllMocks(); vi.unstubAllEnvs();
  vi.stubEnv("NAVER_SHOPPING_CLIENT_ID", "client-id"); vi.stubEnv("NAVER_SHOPPING_CLIENT_SECRET", "client-secret");
  vi.stubGlobal("fetch", m.fetch); m.fetch.mockImplementation(async () => okResponse());
  dir = mkdtempSync(join(tmpdir(), "competitors-")); const file = join(dir, "db.sqlite");
  execFileSync("sqlite3", [file], { input: readdirSync("prisma/migrations").filter(s => /^\d/.test(s)).sort()
    .map(s => readFileSync(`prisma/migrations/${s}/migration.sql`, "utf8")).join("\n") });
  m.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await m.db.user.createMany({ data: [{ id: "owner", email: "owner@test.invalid" }, { id: "other", email: "other@test.invalid" }] });
  m.user.mockResolvedValue({ id: "owner" });
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await m.db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("smartstore URL canonicalization", () => {
  it("normalizes case, trailing slash, query and fragment into one store key and product URL", () => {
    for (const url of ["https://SMARTSTORE.naver.com/Farm-A/products/123/", "https://smartstore.naver.com/farm-a/products/123?NaPm=x#top",
      "https://smartstore.naver.com:443/farm-a/products/123"])
      expect(canonicalProductUrl(url)).toEqual({ storeKey: "farm-a", productUrl: "https://smartstore.naver.com/farm-a/products/123" });
  });
  it("rejects anything that is not an https smartstore product page", () => {
    for (const url of ["http://smartstore.naver.com/farm/products/1", "https://m.smartstore.naver.com/farm/products/1",
      "https://brand.naver.com/farm/products/1", "https://smartstore.naver.com.evil.test/farm/products/1", "https://smartstore.naver.com:8443/farm/products/1",
      "https://user:pw@smartstore.naver.com/farm/products/1", "https://smartstore.naver.com/farm", "https://smartstore.naver.com/farm/products/abc",
      "https://smartstore.naver.com/farm/products/1/reviews", "https://smartstore.naver.com/f/products/1", "https://smartstore.naver.com/농장/products/1"])
      expect(() => canonicalProductUrl(url), url).toThrow(BriefingError);
  });
  it("refuses reserved path segments as store keys like the search adapter does", () => {
    expect(() => canonicalProductUrl("https://smartstore.naver.com/main/products/1")).toThrow(BriefingError);
  });
});

describe("panel registration and the one-active-store rule", () => {
  it("stores the canonical URL and lower-cased key and drops request-only fields", async () => {
    const id = await add("owner", "farm-a", { productUrl: "https://smartstore.naver.com/Farm-A/products/9/?ref=x" });
    const row = await m.db.competitorPanelEntry.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ userId: "owner", storeKey: "farm-a", activeStoreKey: "farm-a", productUrl: product("farm-a", 9), archivedAt: null });
    expect(Object.keys(row)).not.toContain("confirmed");
  });
  it("refuses a second active entry for the same store even with a different product or URL spelling", async () => {
    await add("owner", "farm-a");
    await rejects(mutateCompetitors("owner", panel("farm-a", { productUrl: "https://smartstore.naver.com/FARM-A/products/2" }), now), 409, /이미/);
    await rejects(mutateCompetitors("owner", panel("farm-a", { optionLabel: "5kg", packageKg: 5 }), now), 409);
    expect(await m.db.competitorPanelEntry.count()).toBe(1);
  });
  it("lets another user track the same store independently", async () => {
    await add("owner", "farm-a");
    await add("other", "farm-a");
    expect((await competitorOverview("owner", now)).entries).toHaveLength(1);
    expect((await competitorOverview("other", now)).entries.map(e => e.storeKey)).toEqual(["farm-a"]);
  });
  it("caps the active panel at thirty per user without counting archived or other users' entries", async () => {
    const seed = (userId: string, count: number, archived = false) => m.db.competitorPanelEntry.createMany({ data: Array.from({ length: count }, (_, i) => ({
      userId, storeKey: `s${userId}${i}`, activeStoreKey: archived ? null : `s${userId}${i}`, storeName: "s", productUrl: product(`s${i}`),
      varietyGroup: "JUJUBE", qualityGroup: "REGULAR", optionLabel: "2kg", packageKg: 2, archivedAt: archived ? now : null })) });
    await seed("owner", 29); await seed("owner", 10, true); await seed("other", 30);
    await add("owner", "farm-a");
    await rejects(mutateCompetitors("owner", panel("farm-b"), now), 409, /30곳/);
    expect((await competitorOverview("owner", now)).activeCount).toBe(30);
  });
  it("surfaces a duplicate-store race as a client error, not a 503", async () => {
    // Two concurrent registrations of the same store: at most one row may exist afterwards.
    const results = await Promise.allSettled([mutateCompetitors("owner", panel("farm-a"), now), mutateCompetitors("owner", panel("farm-a"), now)]);
    expect(await m.db.competitorPanelEntry.count({ where: { userId: "owner", activeStoreKey: "farm-a" } })).toBe(1);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBeInstanceOf(BriefingError);
  });
});

describe("archive, replacement and observation history", () => {
  it("archives with a reason, frees the store key, keeps observations and allows re-registration", async () => {
    const first = await add("owner", "farm-a");
    await mutateCompetitors("owner", record(first), now);
    await mutateCompetitors("owner", record(first, { observedAt: ago(8 * DAY).toISOString(), price: 11000 }), now);
    await mutateCompetitors("owner", { action: "archive", entryId: first, reason: "옵션이 3kg로 바뀜" }, now);
    const archived = await m.db.competitorPanelEntry.findUniqueOrThrow({ where: { id: first } });
    expect(archived).toMatchObject({ activeStoreKey: null, archiveReason: "옵션이 3kg로 바뀜", archivedAt: now });
    expect(await m.db.competitorPriceObservation.count({ where: { entryId: first } })).toBe(2);
    const second = await add("owner", "farm-a", { optionLabel: "3kg", packageKg: 3 });
    expect(second).not.toBe(first);
    const overview = await competitorOverview("owner", now);
    expect(overview.activeCount).toBe(1);
    expect(overview.entries.find(e => e.id === first)?.observations).toHaveLength(2);
    expect(overview.entries.find(e => e.id === second)?.observations).toHaveLength(0);
  });
  it("rejects archive and record for an archived entry or another user's entry without touching data", async () => {
    const mine = await add("owner", "farm-a"); const theirs = await add("other", "farm-b");
    await mutateCompetitors("owner", { action: "archive", entryId: mine, reason: "폐점" }, now);
    await rejects(mutateCompetitors("owner", { action: "archive", entryId: mine, reason: "다시" }, now), 404);
    await rejects(mutateCompetitors("owner", record(mine), now), 404);
    await rejects(mutateCompetitors("owner", record(theirs), now), 404);
    await rejects(mutateCompetitors("owner", { action: "archive", entryId: theirs, reason: "남의 것" }, now), 404);
    expect(await m.db.competitorPriceObservation.count()).toBe(0);
    expect((await m.db.competitorPanelEntry.findUniqueOrThrow({ where: { id: theirs } })).archivedAt).toBeNull();
  });
  it("evaluates the replaced store with the new entry only, while archived history stays visible", async () => {
    const stores = ["farm-a", "farm-b", "farm-c"];
    for (const store of stores) await mutateCompetitors("owner", record(await add("owner", store)), now);
    const [first] = (await competitorOverview("owner", now)).groups;
    expect(first).toMatchObject({ count: 3, medianDeliveredPrice: 15000 });
    const old = (await m.db.competitorPanelEntry.findFirstOrThrow({ where: { storeKey: "farm-a" } })).id;
    await mutateCompetitors("owner", { action: "archive", entryId: old, reason: "교체" }, now);
    const replacement = await add("owner", "farm-a");
    const withoutPrice = (await competitorOverview("owner", now)).groups[0];
    expect(withoutPrice).toMatchObject({ count: 2, medianDeliveredPrice: null });
    await mutateCompetitors("owner", record(replacement, { price: 20000 }), now);
    expect((await competitorOverview("owner", now)).groups[0]).toMatchObject({ count: 3, max: 23000 });
  });
});

describe("price observations", () => {
  it("validates observation time and in-stock prices before writing", async () => {
    const id = await add("owner", "farm-a");
    await rejects(mutateCompetitors("owner", record(id, { observedAt: new Date(now.getTime() + 1000).toISOString() }), now), 400, /관측 시각/);
    await rejects(mutateCompetitors("owner", record(id, { observedAt: "1999-12-31T23:59:59Z" }), now), 400);
    await rejects(mutateCompetitors("owner", record(id, { price: null }), now), 400, /양수 가격/);
    await rejects(mutateCompetitors("owner", record(id, { price: 0 }), now), 400);
    expect(await m.db.competitorPriceObservation.count()).toBe(0);
    await mutateCompetitors("owner", record(id, { observedAt: now.toISOString() }), now);
    await mutateCompetitors("owner", record(id, { price: null, shippingFee: null, availability: "OUT_OF_STOCK" }), now);
    await mutateCompetitors("owner", record(id, { price: 12000, shippingFee: null, availability: "UNKNOWN", notes: "" }), now);
    const rows = await m.db.competitorPriceObservation.findMany({ where: { entryId: id } });
    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.userId === "owner" && row.notes === null)).toBe(true);
  });
  it("is idempotent for an identical observation but records a corrected one", async () => {
    const id = await add("owner", "farm-a");
    const first = await mutateCompetitors("owner", record(id, { notes: "쿠폰 적용" }), now) as { id: string; duplicate?: boolean };
    const again = await mutateCompetitors("owner", record(id, { notes: "쿠폰 적용" }), now) as { id: string; duplicate?: boolean };
    expect(again).toEqual({ ok: true, id: first.id, duplicate: true });
    await mutateCompetitors("owner", record(id, { notes: "쿠폰 미적용" }), now);
    await mutateCompetitors("owner", record(id, { shippingFee: 0, notes: "쿠폰 적용" }), now);
    expect(await m.db.competitorPriceObservation.count({ where: { entryId: id } })).toBe(3);
  });
  it("keeps a single row when the same observation is submitted concurrently", async () => {
    const id = await add("owner", "farm-a");
    const results = await Promise.allSettled([mutateCompetitors("owner", record(id), now), mutateCompetitors("owner", record(id), now)]);
    expect(await m.db.competitorPriceObservation.count({ where: { entryId: id } })).toBe(1);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
  });
});

describe("overview isolation and status", () => {
  it("only shows the caller's entries, observations and latest search, and hides future observations", async () => {
    const mine = await add("owner", "farm-a"); const theirs = await add("other", "farm-a");
    await mutateCompetitors("owner", record(mine), now);
    await mutateCompetitors("other", record(theirs, { price: 99999 }), now);
    await m.db.competitorPriceObservation.create({ data: { userId: "owner", entryId: mine, observedAt: new Date(now.getTime() + DAY),
      price: 1, shippingFee: 0, availability: "IN_STOCK" } });
    await mutateCompetitors("other", search(), now);
    const overview = await competitorOverview("owner", now);
    expect(overview.entries).toHaveLength(1);
    expect(overview.entries[0].observations.map(o => o.price)).toEqual([12000]);
    expect(overview.latestSearch).toBeNull();
    expect(overview.activeCount).toBe(1);
    expect((await competitorOverview("other", now)).latestSearch?.status).toBe("SUCCEEDED");
  });
  it("reports configuration from the environment and parses stored search results", async () => {
    await mutateCompetitors("owner", search(), now);
    const configured = await competitorOverview("owner", now);
    expect(configured.configured).toBe(true);
    expect(configured.latestSearch?.result?.items[0]).toMatchObject({ storeKey: "farm-a", listedPrice: 12900, title: "대추방울토마토 2kg" });
    vi.stubEnv("NAVER_SHOPPING_CLIENT_SECRET", "   ");
    expect((await competitorOverview("owner", now)).configured).toBe(false);
  });
  it("keeps every active entry visible regardless of how many archived entries exist", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ userId: "owner", storeKey: `active${i}`, activeStoreKey: `active${i}`, storeName: "s",
      productUrl: product(`active${i}`), varietyGroup: "JUJUBE", qualityGroup: "REGULAR", optionLabel: "2kg", packageKg: 2, createdAt: ago(400 * DAY) }));
    const archived = Array.from({ length: 171 }, (_, i) => ({ ...rows[0], storeKey: `old${i}`, activeStoreKey: null, productUrl: product(`old${i}`),
      archivedAt: ago(DAY), createdAt: ago((200 - i) * DAY) }));
    await m.db.competitorPanelEntry.createMany({ data: [...rows, ...archived] });
    expect((await competitorOverview("owner", now)).activeCount).toBe(30);
  });
});

describe("search reservation, cache and rate limits (mocked transport)", () => {
  it("refuses without server credentials before any reservation or network call", async () => {
    vi.stubEnv("NAVER_SHOPPING_CLIENT_ID", "");
    await rejects(mutateCompetitors("owner", search(), now), 503, /쇼핑검색 키/);
    expect(m.fetch).not.toHaveBeenCalled();
    expect(await m.db.competitorSearch.count()).toBe(0);
  });
  it("calls the official endpoint once with header credentials and never follows redirects", async () => {
    expect(await mutateCompetitors("owner", search("  대추방울  토마토 "), now)).toEqual({ ok: true, cached: false });
    expect(m.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = m.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/openapi\.naver\.com\/v1\/search\/shop\.json\?query=/);
    expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({ "X-Naver-Client-Id": "client-id", "X-Naver-Client-Secret": "client-secret" });
    const row = await m.db.competitorSearch.findFirstOrThrow();
    expect(row).toMatchObject({ userId: "owner", query: "대추방울 토마토", status: "SUCCEEDED", errorCode: null });
    expect(row.response).not.toContain("client-secret");
  });
  it("serves a repeat of the same normalized query from the five-minute bucket without fetching", async () => {
    await mutateCompetitors("owner", search("대추방울 토마토"), now);
    const cached = await mutateCompetitors("owner", search("대추방울   토마토"), new Date(now.getTime() + 60_000));
    expect(cached).toEqual({ ok: true, cached: true });
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(await m.db.competitorSearch.count()).toBe(1);
  });
  it("keeps caches and quotas per user", async () => {
    await mutateCompetitors("owner", search(), now);
    expect(await mutateCompetitors("other", search(), now)).toEqual({ ok: true, cached: false });
    expect(m.fetch).toHaveBeenCalledTimes(2);
  });
  it("blocks a different query inside five minutes and the twenty-first search inside a day", async () => {
    await mutateCompetitors("owner", search("토마토"), now);
    await rejects(mutateCompetitors("owner", search("방울토마토"), new Date(now.getTime() + 299_000)), 429, /5분/);
    expect(await mutateCompetitors("owner", search("방울토마토"), new Date(now.getTime() + 301_000))).toEqual({ ok: true, cached: false });
    await m.db.competitorSearch.deleteMany();
    await m.db.competitorSearch.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ userId: "owner", query: `q${i}`, bucket: `b${i}`,
      status: "SUCCEEDED", createdAt: ago(DAY - 60_000 - i) })) });
    await rejects(mutateCompetitors("owner", search("새 검색"), now), 429, /20회/);
    expect(await m.db.competitorSearch.count()).toBe(20);
    expect(m.fetch).toHaveBeenCalledTimes(2);
  });
  it("records upstream failures as a failed reservation and refuses a retry inside the same bucket", async () => {
    m.fetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await rejects(mutateCompetitors("owner", search(), now), 502, /서버 오류/);
    expect(await m.db.competitorSearch.findFirstOrThrow()).toMatchObject({ status: "FAILED", errorCode: "UPSTREAM_ERROR", response: null });
    await rejects(mutateCompetitors("owner", search(), new Date(now.getTime() + 1000)), 409, /실패/);
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect((await competitorOverview("owner", now)).latestSearch).toMatchObject({ status: "FAILED", errorCode: "UPSTREAM_ERROR", result: null });
  });
  it("does not persist an oversized or malformed upstream body", async () => {
    m.fetch.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    await rejects(mutateCompetitors("owner", search("a"), now), 502);
    m.fetch.mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "content-length": "9999999" } }));
    await rejects(mutateCompetitors("owner", search("b"), new Date(now.getTime() + 600_000)), 502);
    const rows = await m.db.competitorSearch.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map(r => r.errorCode)).toEqual(["INVALID_RESPONSE", "RESPONSE_TOO_LARGE"]);
    expect(rows.every(r => r.response === null)).toBe(true);
  });
  it("performs exactly one upstream call for concurrent identical searches", async () => {
    const results = await Promise.allSettled([mutateCompetitors("owner", search(), now), mutateCompetitors("owner", search(), now)]);
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(await m.db.competitorSearch.count()).toBe(1);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
    for (const result of results) {
      if (result.status === "rejected") { expect(result.reason).toBeInstanceOf(BriefingError); expect([409, 429]).toContain((result.reason as BriefingError).status); }
      else expect(result.value.ok).toBe(true);
    }
  });
  it("never lets concurrent different queries exceed one reservation per five minutes", async () => {
    await Promise.allSettled([mutateCompetitors("owner", search("a"), now), mutateCompetitors("owner", search("b"), now), mutateCompetitors("owner", search("c"), now)]);
    expect(await m.db.competitorSearch.count()).toBe(1);
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("API route", () => {
  it("requires a session for both verbs and never caches", async () => {
    m.user.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await post(panel("farm-a"))).status).toBe(401);
    expect(await m.db.competitorPanelEntry.count()).toBe(0);
    m.user.mockResolvedValue({ id: "owner" });
    const ok = await GET();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(await ok.json()).toMatchObject({ configured: true, activeCount: 0, entries: [], groups: [], target: 30 });
  });
  it("rejects invalid, unconfirmed, unknown-field and oversized bodies with 400 before touching the database", async () => {
    const unconfirmed = { ...panel("farm-a"), confirmed: undefined };
    for (const body of ["{", unconfirmed, { ...panel("farm-a"), extra: 1 }, { action: "record", entryId: "x" },
      { action: "search", query: "" }, { action: "search", query: "x".repeat(101) }, { ...panel("farm-a"), packageKg: 0.01 },
      { ...panel("farm-a"), productUrl: "javascript:alert(1)" }, JSON.stringify({ action: "search", query: "x".repeat(9000) })]) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect(await m.db.competitorPanelEntry.count()).toBe(0);
    expect(await m.db.competitorSearch.count()).toBe(0);
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("maps domain errors to their status and returns generic messages for unexpected failures", async () => {
    const created = await post(panel("farm-a"));
    expect(created.status).toBe(200);
    const { id } = await created.json() as { id: string };
    expect((await post(panel("farm-a"))).status).toBe(409);
    expect((await post({ ...panel("farm-b"), productUrl: "https://example.com/farm/products/1" })).status).toBe(400);
    expect((await post(record("missing"))).status).toBe(404);
    expect((await post(record(id))).status).toBe(200);
    vi.stubEnv("NAVER_SHOPPING_CLIENT_ID", "");
    const unconfigured = await post(search());
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toEqual({ error: "서버에 네이버 공식 쇼핑검색 키를 설정해야 합니다." });
    await m.db.$disconnect();
    m.db = new PrismaClient({ datasources: { db: { url: "file:/nonexistent/dir/db.sqlite" } } });
    const failed = await GET();
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "경쟁점 자료를 불러오지 못했습니다." });
  });
});
