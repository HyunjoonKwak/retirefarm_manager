// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ user: vi.fn(), facets: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSessionUser: mocks.user, isAdmin: () => false }));
vi.mock("@/lib/services/market-facets", () => ({ getMarketVarietyFacets: mocks.facets }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { GET } from "@/app/api/market/garak/route";
const request = (query: string) => GET(new NextRequest(`http://localhost/api/market/garak?action=facets&${query}`));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "user" });
  mocks.facets.mockResolvedValue({ facets: [], collectionState: "stored_records_only" });
});
it("requires a session", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await request("productName=토마토")).status).toBe(401);
  expect(mocks.facets).not.toHaveBeenCalled();
});
it.each(["", "productName=", "productName=토마토&days=0", "productName=토마토&days=wrong", "productName=토마토&days=731"])("rejects invalid facet scope: %s", async query => {
  expect((await request(query)).status).toBe(400);
  expect(mocks.facets).not.toHaveBeenCalled();
});
it("passes the same scope but ignores selected varieties to preserve other candidates", async () => {
  const response = await request("productName=토마토&origin=충남&unit=5kg&days=7&varieties=A");
  expect(response.status).toBe(200);
  expect(mocks.facets).toHaveBeenCalledWith("토마토", 7, "충남", "5kg", null);
});
it("returns a failure status rather than empty availability on database error", async () => {
  mocks.facets.mockRejectedValue(new Error("offline"));
  expect((await request("productName=토마토")).status).toBe(500);
});
