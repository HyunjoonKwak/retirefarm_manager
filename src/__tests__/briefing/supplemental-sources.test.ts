import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), overview: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { workReportImport: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/briefing/competitors", () => ({ competitorOverview: mocks.overview }));
import { supplementalSources } from "@/lib/briefing/supplemental-sources";
const start = new Date("2026-09-06T15:00:00Z"), end = new Date("2026-09-13T15:00:00Z");
const now = new Date("2026-09-14T03:00:00Z");
beforeEach(() => { mocks.findFirst.mockResolvedValue(null); mocks.overview.mockResolvedValue({ activeCount: 0, groups: [] }); });
describe("supplemental sources", () => {
  it("does not create numeric facts from unavailable competitors or raw-only imports", async () => {
    mocks.findFirst.mockResolvedValue({ id: "import", title: "Archive", version: 1, createdAt: now, sourceUrl: null, normalized: JSON.stringify({ status: "UNSUPPORTED" }) });
    const result = await supplementalSources("owner", start, end, now);
    expect(result.metrics).toEqual([]);
    expect(result.sources.every(s => s.status === "NOT_COLLECTED")).toBe(true);
    expect(mocks.findFirst.mock.calls[0][0].where.userId).toBe("owner");
  });
  it("includes only the completed KST reporting week and keeps public means separate", async () => {
    const week = (weekStart: string, weekEnd: string, mean: number) => ({ weekStart, weekEnd, grades: [{ grade: "상", mean, dayCount: 6 }] });
    mocks.findFirst.mockResolvedValue({ id: "import", title: "Archive", version: 2, createdAt: now, sourceUrl: null, normalized: JSON.stringify({
      status: "SUPPORTED", statisticsVersion: "public-daily-simple-mean-v1", series: [{ label: "대추방울", packageKg: 3,
        weekly: [week("2026-09-07", "2026-09-13", 20000), week("2026-09-14", "2026-09-20", 99999)] }],
    }) });
    const result = await supplementalSources("owner", start, end, now);
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0]).toMatchObject({ value: 20000, unit: "원/3kg", sourceId: "work-import" });
    expect(result.sources.find(s => s.id === "work-import")?.note).toContain("단순평균");
  });
  it("does not alter deduplication context merely because generatedAt changes", async () => {
    const a = await supplementalSources("owner", start, end, now);
    const b = await supplementalSources("owner", start, end, new Date(now.getTime()+1000));
    expect(a).toEqual(b);
  });
  it("exports verified group medians and matched changes, never candidate minimum prices", async () => {
    mocks.overview.mockResolvedValue({ activeCount: 4, groups: [
      { label: "일반 3kg", count: 3, medianDeliveredPrice: 23500, previousWeekChangePct: 5 },
      { label: "선물 3kg", count: 1, medianDeliveredPrice: null, previousWeekChangePct: null },
    ] });
    const result = await supplementalSources("owner", start, end, now);
    expect(result.metrics.map(m => m.value)).toEqual([23500, 3, 5]);
    expect(result.sources[0].status).toBe("AVAILABLE");
  });
});
