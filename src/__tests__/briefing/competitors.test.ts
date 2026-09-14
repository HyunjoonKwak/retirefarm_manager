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
import { competitorRequestSchema, SEARCH_RETIRED_MESSAGE, type CompetitorRequest } from "@/lib/briefing/competitor-contracts";
import { BriefingError } from "@/lib/briefing/queue";
import { GET, POST } from "@/app/api/briefings/competitors/route";

let dir: string;
const now = new Date("2026-09-14T03:00:00.000Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(now.getTime() - ms);
const product = (store: string, id = 1) => `https://smartstore.naver.com/${store}/products/${id}`;
const brandProduct = (store: string, id = 1) => `https://brand.naver.com/${store}/products/${id}`;
const panel = (store: string, overrides: Partial<Extract<CompetitorRequest, { action: "addPanel" }>> = {}): CompetitorRequest => ({
  action: "addPanel", storeName: `${store} 농장`, productUrl: product(store), productName: "토마토", varietyGroup: "JUJUBE",
  qualityGroup: "REGULAR", optionLabel: "2kg 1박스", packageKg: 2, sizeGrade: "MEDIUM", sizeCriteria: "직경 40~50mm", confirmed: true, ...overrides });
const record = (entryId: string, overrides: Partial<Extract<CompetitorRequest, { action: "record" }>> = {}): CompetitorRequest => ({
  action: "record", entryId, observedAt: ago(DAY).toISOString(), price: 12000, shippingFee: 3000, availability: "IN_STOCK", ...overrides });
// Requests pass through the route schema so service tests see exactly what the API hands over (trim, strict keys).
const search = (query = "대추방울토마토"): CompetitorRequest => competitorRequestSchema.parse({ action: "search", query });
// A search row stored while the API was still alive; the retired search action must leave such history readable.
const storedResult = (store = "farm-a") => ({ query: "대추방울토마토", sort: "sim", observedAt: ago(90 * DAY).toISOString(), total: 1, excludedCount: 0,
  items: [{ productId: "1", title: "대추방울토마토 2kg", url: product(store), mallName: `${store} 농장`, listedPrice: 12900, rank: 1, productType: "2",
    proposedPackageKg: 2, varietyGroup: "JUJUBE", reviewReasons: [], excluded: false, storeKey: store }] });
const seedSearch = (userId: string, overrides: Record<string, unknown> = {}) => m.db.competitorSearch.create({ data: { userId, query: "대추방울토마토",
  bucket: "legacy", status: "SUCCEEDED", response: JSON.stringify(storedResult()), createdAt: ago(90 * DAY), ...overrides } });
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
  vi.stubGlobal("fetch", m.fetch); m.fetch.mockImplementation(async () => { throw new Error("network must not be touched"); });
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
      "https://smartstore.naver.com.evil.test/farm/products/1", "https://smartstore.naver.com:8443/farm/products/1",
      "https://user:pw@smartstore.naver.com/farm/products/1", "https://smartstore.naver.com/farm", "https://smartstore.naver.com/farm/products/abc",
      "https://smartstore.naver.com/farm/products/1/reviews", "https://smartstore.naver.com/f/products/1", "https://smartstore.naver.com/농장/products/1"])
      expect(() => canonicalProductUrl(url), url).toThrow(BriefingError);
  });
  it("refuses reserved path segments as store keys like the search adapter does", () => {
    expect(() => canonicalProductUrl("https://smartstore.naver.com/main/products/1")).toThrow(BriefingError);
    expect(() => canonicalProductUrl("https://brand.naver.com/search/products/1")).toThrow(BriefingError);
  });
});

describe("brand store URL canonicalization", () => {
  it("accepts exact brand.naver.com product pages under a prefixed key that can never alias a smartstore slug", () => {
    for (const url of ["https://BRAND.naver.com/Farm-A/products/77/", "https://brand.naver.com/farm-a/products/77?NaPm=x#top", "https://brand.naver.com:443/farm-a/products/77"])
      expect(canonicalProductUrl(url)).toEqual({ storeKey: "brand:farm-a", productUrl: "https://brand.naver.com/farm-a/products/77" });
    expect(canonicalProductUrl(product("farm-a")).storeKey).toBe("farm-a");
    expect(canonicalProductUrl(brandProduct("farm-a")).storeKey).not.toBe(canonicalProductUrl(product("farm-a")).storeKey);
  });
  it("rejects hostile or look-alike brand hosts, other schemes, ports, credentials and non-product paths", () => {
    for (const url of ["http://brand.naver.com/farm/products/1", "https://m.brand.naver.com/farm/products/1", "https://xbrand.naver.com/farm/products/1",
      "https://brand.naver.com.evil.test/farm/products/1", "https://brand.naver.com.evil.test/brand.naver.com/products/1", "https://evil.test/brand.naver.com/farm/products/1",
      "https://brand.naver.co/farm/products/1", "https://brand.naver.com:8443/farm/products/1", "https://user:pw@brand.naver.com/farm/products/1",
      "https://brand.naver.com./farm/products/1", "https://brand.naver.com/farm", "https://brand.naver.com/farm/products/abc", "https://brand.naver.com/farm/products/1/reviews",
      "https://brand.naver.com/f/products/1", "https://brand.naver.com/브랜드/products/1", "https://brand.naver.com/brand:farm/products/1",
      "https://shopping.naver.com/farm/products/1", "https://naver.com/farm/products/1",
      // Hosts that name Object.prototype members must not resolve through an inherited property.
      "https://constructor/farm/products/1", "https://__proto__/farm/products/1", "https://hasownproperty/farm/products/1", "https://tostring/farm/products/1"])
      expect(() => canonicalProductUrl(url), url).toThrow(BriefingError);
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
  it("persists the confirmed size grade and criteria, and copies them into the created row verbatim", async () => {
    const id = await add("owner", "farm-a", { sizeGrade: "LARGE", sizeCriteria: "직경 50mm 이상" });
    expect(await m.db.competitorPanelEntry.findUniqueOrThrow({ where: { id } })).toMatchObject({ sizeGrade: "LARGE", sizeCriteria: "직경 50mm 이상" });
    const overview = await competitorOverview("owner", now);
    expect(overview.entries[0]).toMatchObject({ sizeGrade: "LARGE", sizeCriteria: "직경 50mm 이상" });
  });
  it("defaults omitted size fields to UNKNOWN and empty criteria through the API schema so old clients keep working", async () => {
    const legacy = { ...panel("farm-a"), sizeGrade: undefined, sizeCriteria: undefined };
    const parsed = competitorRequestSchema.parse(legacy);
    expect(parsed).toMatchObject({ sizeGrade: "UNKNOWN", sizeCriteria: "" });
    const created = await post(legacy);
    expect(created.status).toBe(200);
    const row = await m.db.competitorPanelEntry.findFirstOrThrow();
    expect(row).toMatchObject({ sizeGrade: "UNKNOWN", sizeCriteria: "" });
    expect((await competitorOverview("owner", now)).groups).toEqual([]);
  });
  it("keeps a brand store and a smartstore with the same slug as two separate active entries", async () => {
    await add("owner", "farm-a");
    const brand = await add("owner", "farm-a", { productUrl: brandProduct("farm-a", 5) });
    expect(await m.db.competitorPanelEntry.findUniqueOrThrow({ where: { id: brand } })).toMatchObject({ storeKey: "brand:farm-a", activeStoreKey: "brand:farm-a",
      productUrl: brandProduct("farm-a", 5) });
    await rejects(mutateCompetitors("owner", panel("farm-a", { productUrl: "https://BRAND.naver.com/FARM-A/products/6" }), now), 409, /이미/);
    expect(await m.db.competitorPanelEntry.count({ where: { userId: "owner" } })).toBe(2);
    expect((await competitorOverview("owner", now)).activeCount).toBe(2);
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
    await seedSearch("other");
    const overview = await competitorOverview("owner", now);
    expect(overview.entries).toHaveLength(1);
    expect(overview.entries[0].observations.map(o => o.price)).toEqual([12000]);
    expect(overview.latestSearch).toBeNull();
    expect(overview.activeCount).toBe(1);
    expect((await competitorOverview("other", now)).latestSearch?.status).toBe("SUCCEEDED");
  });
  it("never reports search as configured, even with server credentials present, while still parsing stored search history", async () => {
    await seedSearch("owner");
    const overview = await competitorOverview("owner", now);
    expect(overview.configured).toBe(false);
    expect(overview.searchRetiredOn).toBe("2026-07-31");
    expect(overview.limitations[0]).toBe(SEARCH_RETIRED_MESSAGE);
    expect(overview.latestSearch).toMatchObject({ status: "SUCCEEDED", errorCode: null });
    expect(overview.latestSearch?.result?.items[0]).toMatchObject({ storeKey: "farm-a", listedPrice: 12900, title: "대추방울토마토 2kg" });
    vi.stubEnv("NAVER_SHOPPING_CLIENT_ID", ""); vi.stubEnv("NAVER_SHOPPING_CLIENT_SECRET", "");
    expect((await competitorOverview("owner", now)).configured).toBe(false);
  });
  it("shows the newest stored search per user, including failed ones, without a parsed result for empty responses", async () => {
    await seedSearch("owner", { createdAt: ago(100 * DAY) });
    await seedSearch("owner", { query: "방울토마토", bucket: "legacy-2", status: "FAILED", errorCode: "UPSTREAM_ERROR", response: null, createdAt: ago(80 * DAY) });
    expect((await competitorOverview("owner", now)).latestSearch).toMatchObject({ status: "FAILED", errorCode: "UPSTREAM_ERROR", result: null });
    expect((await competitorOverview("other", now)).latestSearch).toBeNull();
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

describe("retired search action", () => {
  it("answers 410 before any network call or database write even when server credentials are present", async () => {
    await rejects(mutateCompetitors("owner", search("  대추방울  토마토 "), now), 410, /2026-07-31/);
    await rejects(mutateCompetitors("owner", search(), now), 410, new RegExp(SEARCH_RETIRED_MESSAGE));
    expect(m.fetch).not.toHaveBeenCalled();
    expect(await m.db.competitorSearch.count()).toBe(0);
  });
  it("answers 410 without credentials too, so the retirement is not mistaken for a configuration problem", async () => {
    vi.stubEnv("NAVER_SHOPPING_CLIENT_ID", ""); vi.stubEnv("NAVER_SHOPPING_CLIENT_SECRET", "");
    await rejects(mutateCompetitors("owner", search(), now), 410);
    expect(m.fetch).not.toHaveBeenCalled();
    expect(await m.db.competitorSearch.count()).toBe(0);
  });
  it("leaves stored search history untouched and per user after a retired search attempt", async () => {
    const mine = await seedSearch("owner"); await seedSearch("other", { query: "남의 검색" });
    await rejects(mutateCompetitors("owner", search(), now), 410);
    await rejects(mutateCompetitors("owner", search("대추방울토마토"), new Date(now.getTime() + 600_000)), 410);
    expect(await m.db.competitorSearch.count()).toBe(2);
    expect((await competitorOverview("owner", now)).latestSearch?.id).toBe(mine.id);
    expect((await competitorOverview("other", now)).latestSearch?.result?.query).toBe("대추방울토마토");
  });
  it("does not consume any rate-limit or reservation state: many concurrent retired searches leave zero rows", async () => {
    const results = await Promise.allSettled(["a", "b", "c", "a"].map(q => mutateCompetitors("owner", search(q), now)));
    expect(results.every(r => r.status === "rejected" && r.reason instanceof BriefingError && r.reason.status === 410)).toBe(true);
    expect(await m.db.competitorSearch.count()).toBe(0);
    expect(m.fetch).not.toHaveBeenCalled();
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
    expect(await ok.json()).toMatchObject({ configured: false, searchRetiredOn: "2026-07-31", activeCount: 0, entries: [], groups: [], target: 30 });
  });
  it("rejects invalid, unconfirmed, unknown-field and oversized bodies with 400 before touching the database", async () => {
    const unconfirmed = { ...panel("farm-a"), confirmed: undefined };
    for (const body of ["{", unconfirmed, { ...panel("farm-a"), extra: 1 }, { action: "record", entryId: "x" },
      { action: "search", query: "" }, { action: "search", query: "x".repeat(101) }, { ...panel("farm-a"), packageKg: 0.01 },
      { ...panel("farm-a"), productUrl: "javascript:alert(1)" }, JSON.stringify({ action: "search", query: "x".repeat(9000) }),
      { ...panel("farm-a"), sizeGrade: "JUMBO" }, { ...panel("farm-a"), sizeGrade: "중과" }, { ...panel("farm-a"), sizeCriteria: "x".repeat(101) },
      { ...panel("farm-a"), sizeCriteria: null }]) {
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
    const retired = await post(search());
    expect(retired.status).toBe(410);
    expect(await retired.json()).toEqual({ error: SEARCH_RETIRED_MESSAGE });
    expect(m.fetch).not.toHaveBeenCalled();
    expect(await m.db.competitorSearch.count()).toBe(0);
    expect((await post({ ...panel("farm-c"), productUrl: brandProduct("farm-a") })).status).toBe(200);
    await m.db.$disconnect();
    m.db = new PrismaClient({ datasources: { db: { url: "file:/nonexistent/dir/db.sqlite" } } });
    const failed = await GET();
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "경쟁점 자료를 불러오지 못했습니다." });
  });
});
