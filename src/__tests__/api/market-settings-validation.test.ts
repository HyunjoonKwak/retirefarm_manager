// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ session: vi.fn(), upsert: vi.fn(), update: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ default: { marketCollectionSettings: { upsert: m.upsert } } }));
vi.mock("@/lib/scheduler", () => ({ updateSchedule: m.update }));
vi.mock("@/lib/services/garak-market", () => ({ CORPORATION_CODES: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { PATCH } from "@/app/api/market/garak/settings/route";
import { marketScheduleIssues } from "@/lib/market-schedule-validation";
const patch = (body: unknown) => PATCH(new NextRequest("http://localhost/api/market/garak/settings", { method: "PATCH", body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); m.session.mockResolvedValue({ user: { id: "owner" } }); m.upsert.mockResolvedValue({ id: "setting" }); });
it.each([{ collectTime: "99:99" }, { collectTime: "24:00" }, { collectTime: "12:60" }, { collectDays: [] }, { collectDays: [1.5] }, { collectDaysAgo: 0.5 }])("rejects invalid schedules before storage: %j", async body => {
  expect((await patch(body)).status).toBe(400); expect(m.upsert).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it.each(["00:00", "23:59"])("allows valid time boundary %s", async collectTime => {
  expect((await patch({ collectTime, collectDays: [0, 6], collectDaysAgo: 7 })).status).toBe(200);
  expect(m.upsert.mock.calls[0][0].update).toMatchObject({ collectTime, collectDays: "0,6", collectDaysAgo: 7 });
});
it("diagnoses persisted invalid settings without disclosing identifiers or changing readiness", () => {
  expect(marketScheduleIssues({ collectTime: "09:30", collectDays: "0,1,6", collectDaysAgo: 0 })).toEqual([]);
  expect(marketScheduleIssues({ collectTime: "99:99", collectDays: "", collectDaysAgo: .5 })).toHaveLength(3);
});
