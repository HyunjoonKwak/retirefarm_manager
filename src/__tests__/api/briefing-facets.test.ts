// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), facets: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSessionUser: mocks.user }));
vi.mock("@/lib/briefing/facets", () => ({ getBriefingFacets: mocks.facets }));
import { GET } from "@/app/api/briefings/facets/route";
const request = (query: string) => GET(new Request(`http://localhost/api/briefings/facets?${query}`));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.facets.mockResolvedValue({ origins: [], varieties: [], collectionState: "stored_records_only" });
});
it("requires a session before touching stored records", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await request("productName=토마토")).status).toBe(401);
  expect(mocks.facets).not.toHaveBeenCalled();
});
it.each(["", "productName=", "productName=%20", `productName=${"가".repeat(51)}`, `productName=토마토&origin=${"가".repeat(51)}`])(
  "rejects invalid scope: %s", async query => {
    expect((await request(query)).status).toBe(400);
    expect(mocks.facets).not.toHaveBeenCalled();
  });
it("passes the trimmed product and origin for the session user only and never caches", async () => {
  const response = await request("productName=%20토마토%20&origin=%20충남%20");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.facets).toHaveBeenCalledWith("owner", { productName: "토마토", origin: "충남" });
  expect(await response.json()).toMatchObject({ collectionState: "stored_records_only" });
  await request("productName=토마토");
  expect(mocks.facets).toHaveBeenLastCalledWith("owner", { productName: "토마토" });
});
it("explains missing corporation settings and reports other failures as unavailable", async () => {
  mocks.facets.mockRejectedValueOnce(new Error("NO_CORPORATIONS"));
  const missing = await request("productName=토마토");
  expect(missing.status).toBe(400);
  expect((await missing.json()).error).toMatch(/법인/);
  mocks.facets.mockRejectedValueOnce(new Error("offline"));
  const failed = await request("productName=토마토");
  expect(failed.status).toBe(503);
  expect((await failed.json()).error).not.toMatch(/offline/);
});
