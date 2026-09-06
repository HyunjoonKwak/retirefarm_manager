// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ user: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSessionUser: mocks.user }));
vi.mock("@/lib/prisma", () => ({ default: { auctionResult: { findMany: mocks.rows } } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { GET } from "@/app/api/market/garak/analysis/route";
const request = (query: string) => GET(new NextRequest(`http://localhost/api/market/garak/analysis?${query}`));
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: "user" }); mocks.rows.mockResolvedValue([]); });
it("requires login and validates the requested window", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await request("productName=토마토")).status).toBe(401);
  mocks.user.mockResolvedValue({ id: "user" });
  expect((await request("productName=토마토&days=0")).status).toBe(400);
  expect((await request("")).status).toBe(400);
  expect(mocks.rows).not.toHaveBeenCalled();
});
it("returns separate packaging groups and explicitly limited source coverage", async () => {
  const base = { variety: "완숙", grade: "특", price: 10000, quantity: 10, auctionDate: new Date(), origin: "논산", corporation: "법인" };
  mocks.rows.mockResolvedValue([
    ...Array.from({ length: 5 }, (_, i) => ({ ...base, id: `a${i}`, unit: "5kg" })),
    ...Array.from({ length: 5 }, (_, i) => ({ ...base, id: `b${i}`, unit: "10kg", price: 20000 })),
  ]);
  const response = await request("productName=토마토&days=7&origin=논산");
  const data = await response.json();
  expect(data.summaries).toHaveLength(2);
  expect(data.collectionState).toBe("stored_records_only");
  expect(data.truncated).toBe(false);
  expect(mocks.rows.mock.calls[0][0].where.origin).toEqual({ contains: "논산" });
});
it("does not disguise database failure as absent trades", async () => {
  mocks.rows.mockRejectedValue(new Error("offline"));
  expect((await request("productName=토마토")).status).toBe(500);
});
