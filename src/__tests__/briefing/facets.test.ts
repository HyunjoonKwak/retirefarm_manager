// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const m = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/prisma", () => ({ default: new Proxy({}, { get: (_, key) => {
  const value = Reflect.get(m.db, key); return typeof value === "function" ? value.bind(m.db) : value;
} }) }));
import { getBriefingFacets } from "@/lib/briefing/facets";

// Previous completed KST week for NOW: [2026-09-06T15:00Z, 2026-09-13T15:00Z)
const NOW = new Date("2026-09-14T01:00:00Z");
const WEEK_START = "2026-09-06T15:00:00Z";
const WEEK_END = "2026-09-13T15:00:00Z";
let dir: string;
type Row = { origin?: string; variety?: string; auctionDate?: string; corporationCode?: string; price?: number; quantity?: number; productName?: string; grade?: string };
const row = (overrides: Row, index: number) => ({
  productName: "토마토", variety: "완숙", origin: "충남", unit: "5kg", grade: overrides.grade ?? `${index}`, price: 10000, quantity: 1,
  corporation: `법인${overrides.corporationCode ?? "11000101"}`, corporationCode: "11000101", auctionDate: new Date("2026-09-08T03:00:00Z"),
  ...overrides, ...(overrides.auctionDate ? { auctionDate: new Date(overrides.auctionDate) } : {}),
});
const seed = (rows: Row[]) => m.db.auctionResult.createMany({ data: rows.map(row) });
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "briefing-facets-")); const file = join(dir, "db.sqlite");
  execFileSync("sqlite3", [file], { input: readdirSync("prisma/migrations").filter(s => /^\d/.test(s)).sort()
    .map(s => readFileSync(`prisma/migrations/${s}/migration.sql`, "utf8")).join("\n") });
  m.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await m.db.user.create({ data: { id: "owner", email: "owner@test.invalid" } });
});
afterEach(async () => { await m.db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

it("only counts valid records inside the previous completed KST week", async () => {
  await seed([
    { origin: "장수", variety: "주간직전", auctionDate: "2026-09-06T14:59:59Z" },
    { origin: "평택", variety: "주간시작", auctionDate: WEEK_START },
    { origin: "평택", variety: "주간끝", auctionDate: "2026-09-13T14:59:59Z" },
    { origin: "장수", variety: "이번주", auctionDate: WEEK_END },
    { origin: "평택", variety: "무효가격", price: 0 },
    { origin: "평택", variety: "무효수량", quantity: 0 },
    { origin: "평택", variety: "다른품목", productName: "대추" },
  ]);
  const facets = await getBriefingFacets("owner", { productName: "토마토" }, NOW);
  expect(facets.periodStart).toBe("2026-09-06T15:00:00.000Z");
  expect(facets.periodEnd).toBe("2026-09-13T15:00:00.000Z");
  expect(facets.origins).toEqual([{ origin: "평택", tradeCount: 2, varietyCount: 2 }]);
  expect(facets.varieties.map(item => item.variety)).toEqual(["주간끝", "주간시작"]);
  expect(facets.collectionState).toBe("stored_records_only");
  expect(facets.asOf).toBe(NOW.toISOString());
});
it("scopes to the user's selected corporation codes with the same fallback as the snapshot", async () => {
  await seed([
    { origin: "충남", variety: "A", corporationCode: "11000101" },
    { origin: "경북", variety: "B", corporationCode: "11000102" },
    { origin: "전남", variety: "C", corporationCode: "11000103" },
  ]);
  const fallback = await getBriefingFacets("owner", { productName: "토마토" }, NOW);
  expect(fallback.corporations).toEqual(["11000101", "11000102"]);
  expect(fallback.origins.map(item => item.origin)).toEqual(["경북", "충남"]);
  await m.db.marketCollectionSettings.create({ data: { userId: "owner", corporationCodes: " 11000103,11000103, " } });
  const scoped = await getBriefingFacets("owner", { productName: "토마토" }, NOW);
  expect(scoped.corporations).toEqual(["11000103"]);
  expect(scoped.origins).toEqual([{ origin: "전남", tradeCount: 1, varietyCount: 1 }]);
  expect(scoped.varieties).toEqual([{ variety: "C", tradeCount: 1, observedForOrigin: true }]);
  await m.db.marketCollectionSettings.update({ where: { userId: "owner" }, data: { corporationCodes: " , " } });
  await expect(getBriefingFacets("owner", { productName: "토마토" }, NOW)).rejects.toThrow("NO_CORPORATIONS");
});
it("matches the selected origin exactly and flags varieties unobserved for it while keeping every origin", async () => {
  await seed([
    { origin: "충남", variety: "완숙" }, { origin: "충남", variety: "완숙", grade: "상" }, { origin: "충남", variety: "대추" },
    { origin: "충남 논산", variety: "방울" }, { origin: "논산", variety: "완숙" },
  ]);
  const facets = await getBriefingFacets("owner", { productName: "토마토", origin: " 충남 " }, NOW);
  expect(facets.scope).toEqual({ productName: "토마토", origin: "충남" });
  expect(facets.origins.map(item => item.origin)).toEqual(["논산", "충남", "충남 논산"]);
  expect(facets.varieties).toEqual([
    { variety: "대추", tradeCount: 1, observedForOrigin: true },
    { variety: "방울", tradeCount: 0, observedForOrigin: false },
    { variety: "완숙", tradeCount: 2, observedForOrigin: true },
  ]);
  const all = await getBriefingFacets("owner", { productName: "토마토", origin: "" }, NOW);
  expect(all.scope.origin).toBeNull();
  expect(all.varieties.every(item => item.observedForOrigin)).toBe(true);
  expect(all.varieties.find(item => item.variety === "완숙")?.tradeCount).toBe(3);
  const unknown = await getBriefingFacets("owner", { productName: "토마토", origin: "제주" }, NOW);
  expect(unknown.origins).toHaveLength(3);
  expect(unknown.varieties.every(item => !item.observedForOrigin && item.tradeCount === 0)).toBe(true);
});
it("never offers blank origin or variety as a choice because an empty filter means all", async () => {
  await seed([{ origin: "", variety: "" }, { origin: "", variety: "완숙" }, { origin: "충남", variety: "" }]);
  const facets = await getBriefingFacets("owner", { productName: "토마토" }, NOW);
  expect(facets.origins).toEqual([{ origin: "충남", tradeCount: 1, varietyCount: 0 }]);
  expect(facets.varieties).toEqual([{ variety: "완숙", tradeCount: 1, observedForOrigin: true }]);
});
