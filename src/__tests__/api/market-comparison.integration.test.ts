// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
const m = vi.hoisted(() => ({ db: null as unknown as PrismaClient, user: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: new Proxy({}, { get: (_, key) => {
  const value = Reflect.get(m.db, key); return typeof value === "function" ? value.bind(m.db) : value;
} }) }));
vi.mock("@/lib/auth/guards", () => ({ getSessionUser: m.user, isAdmin: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { GET, POST, DELETE } from "@/app/api/market/garak/presets/route";
import { GET as queryMarket } from "@/app/api/market/garak/route";
import { GET as queryAnalysis } from "@/app/api/market/garak/analysis/route";
import { marketDateKey, marketDayStart } from "@/lib/market-date";
let dir: string;
const base = { name: "출하 비교", productName: "토마토", varieties: ["완숙"], origin: "논산", unit: "5kg", grade: "특" };
const post = (data: unknown) => POST(new NextRequest("http://localhost/api/market/garak/presets", { method: "POST", body: JSON.stringify(data) }));
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "market-presets-"));
  const file = path.join(dir, "db.sqlite");
  execFileSync("sqlite3", [file], { input: fs.readdirSync("prisma/migrations").filter(s => /^\d/.test(s)).sort().map(s => fs.readFileSync(`prisma/migrations/${s}/migration.sql`, "utf8")).join("\n") });
  m.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  for (const id of ["owner", "other"]) await m.db.user.create({ data: { id, email: `${id}@test.invalid` } });
  m.user.mockResolvedValue({ id: "owner" });
});
afterEach(async () => { await m.db.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); });
it("saves all comparison dimensions and isolates listing/deletion by account", async () => {
  const response = await post(base); expect(response.status).toBe(201);
  const { preset } = await response.json(); expect(preset).toMatchObject(base); expect(preset).not.toHaveProperty("userId");
  expect((await (await GET()).json()).presets).toHaveLength(1);
  m.user.mockResolvedValue({ id: "other" });
  expect((await (await GET()).json()).presets).toEqual([]);
  const req = new NextRequest(`http://localhost/api/market/garak/presets?id=${preset.id}`, { method: "DELETE" });
  expect((await DELETE(req)).status).toBe(404);
  expect(await m.db.marketComparisonPreset.count()).toBe(1);
  m.user.mockResolvedValue({ id: "owner" }); expect((await DELETE(req)).status).toBe(200);
});
it("rejects anonymous requests, malformed inputs and ownership injection", async () => {
  m.user.mockResolvedValue(null); expect((await GET()).status).toBe(401); expect((await post(base)).status).toBe(401);
  m.user.mockResolvedValue({ id: "owner" });
  for (const data of [{ ...base, userId: "other" }, { ...base, name: " " }, { ...base, varieties: Array(31).fill("A") }]) expect((await post(data)).status).toBe(400);
  expect(await m.db.marketComparisonPreset.count()).toBe(0);
});
it("caps saved conditions without dropping existing records and cascades on user deletion", async () => {
  for (let i = 0; i < 50; i++) await m.db.marketComparisonPreset.create({ data: { userId: "owner", name: `${i}`, productName: "토마토" } });
  expect((await post(base)).status).toBe(409); expect(await m.db.marketComparisonPreset.count()).toBe(50);
  await m.db.user.delete({ where: { id: "owner" } }); expect(await m.db.marketComparisonPreset.count()).toBe(0);
});

it("history, daily details and distribution use the same grade/variety/unit scope and weighting", async () => {
  const date = marketDateKey(new Date());
  const row = { productName: "토마토", variety: "완숙", origin: "충남 논산", grade: "특", unit: "5kg", corporation: "법인", corporationCode: "01", auctionDate: marketDayStart(date) };
  for (const data of [{ price: 100, quantity: 1 }, { price: 200, quantity: 9 }, { price: 10000, quantity: 1, grade: "상" }, { price: 9999, quantity: 1, unit: "10kg" }, { price: 8888, quantity: 1, variety: "방울" }]) {
    await m.db.auctionResult.create({ data: { ...row, ...data } });
  }
  const query = `productName=토마토&varieties=완숙&grade=특&unit=5kg&origin=논산&days=7&date=${date}`;
  const history = await (await queryMarket(new NextRequest(`http://localhost/api/market/garak?action=history&${query}`))).json();
  const daily = await (await queryMarket(new NextRequest(`http://localhost/api/market/garak?action=dailyDetail&${query}`))).json();
  expect(history.history).toHaveLength(1); expect(history.history[0]).toMatchObject({ date, avgPrice: 190, tradeCount: 2, pricePerKg: 38 });
  expect(daily.stats).toMatchObject({ avgPrice: 190, tradeCount: 2, pricePerKg: 38 }); expect(daily.results).toHaveLength(2);
  const analysis = await (await queryAnalysis(new NextRequest(`http://localhost/api/market/garak/analysis?${query}`))).json();
  expect(analysis.summaries).toHaveLength(1); expect(analysis.summaries[0]).toMatchObject({ grade: "특", variety: "완숙", unit: "5kg", tradeCount: 2 });
  expect(analysis.summaries[0].median).toBeNull(); // Small samples remain explicitly insufficient.
  const facets = await (await queryMarket(new NextRequest(`http://localhost/api/market/garak?action=facets&${query}`))).json();
  expect(facets.grades).toEqual(["상", "특"]);
  expect(facets.facets.find((f: { variety: string }) => f.variety === "완숙").matchingCount).toBe(2);
});

it("label audit proposes aliases without altering raw records", async () => {
  const row = { productName: "토마토", origin: "논산", grade: "특", unit: ".5kg", corporation: "법인", corporationCode: "01", auctionDate: new Date(), price: 1000, quantity: 2 };
  for (const variety of ["대저토마토", "토마토(대저)", "방울토마토"]) await m.db.auctionResult.create({ data: { ...row, variety } });
  const output = execFileSync(process.execPath, ["scripts/market-label-audit.cjs", "--product", "토마토"], {
    encoding: "utf8", env: { ...process.env, DATABASE_URL: `file:${path.join(dir, "db.sqlite")}` },
  });
  const audit = JSON.parse(output);
  expect(audit.tradeCount).toBe(3);
  const candidates = audit.dimensions.variety.filter((r: { requiresReview: boolean }) => r.requiresReview);
  expect(candidates).toHaveLength(1); expect(candidates[0].labels).toHaveLength(2);
  expect(await m.db.auctionResult.count()).toBe(3);
  expect((await m.db.auctionResult.findMany()).map(r => r.variety).sort()).toEqual(["대저토마토", "방울토마토", "토마토(대저)"]);
});
