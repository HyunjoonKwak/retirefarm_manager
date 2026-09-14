// @vitest-environment node
import { describe, expect, it } from "vitest";
import { summarizeCompetitors } from "@/lib/briefing/competitor-stats";
import type { CompetitorEntry, CompetitorObservation } from "@/lib/briefing/competitor-contracts";

const now = new Date("2026-09-14T03:00:00.000Z");
const DAY = 86_400_000;
const at = (daysAgo: number, extraMs = 0) => new Date(now.getTime() - daysAgo * DAY + extraMs).toISOString();

let seq = 0;
function obs(daysAgo: number, price: number | null, shippingFee: number | null = 3000,
  availability = "IN_STOCK", extraMs = 0): CompetitorObservation {
  return { id: `o${++seq}`, observedAt: at(daysAgo, extraMs), price, shippingFee, availability, notes: null };
}
function entry(storeKey: string, observations: CompetitorObservation[], overrides: Partial<CompetitorEntry> = {}): CompetitorEntry {
  return { id: `e-${storeKey}-${++seq}`, storeKey, storeName: storeKey, productUrl: `https://smartstore.naver.com/${storeKey}/products/1`,
    productName: "토마토", varietyGroup: "JUJUBE", qualityGroup: "REGULAR", optionLabel: "2kg", packageKg: 2,
    sizeGrade: "MEDIUM", sizeCriteria: "직경 40~50mm", archivedAt: null, archiveReason: null, observations, ...overrides };
}
/** A row serialized before the size columns existed: no sizeGrade/sizeCriteria keys at all. */
function legacyEntry(storeKey: string, observations: CompetitorObservation[]): CompetitorEntry {
  const legacy: CompetitorEntry = { ...entry(storeKey, observations) };
  delete legacy.sizeGrade; delete legacy.sizeCriteria;
  return legacy;
}
/** Three healthy stores observed today and a week ago; the baseline for most cases. */
function healthyPanel() {
  return [
    entry("a", [obs(0, 10000), obs(7, 9000)]),
    entry("b", [obs(1, 12000), obs(8, 12000)]),
    entry("c", [obs(2, 14000), obs(9, 16000)]),
  ];
}

describe("representative price threshold", () => {
  it("publishes median/min/max only with three distinct in-stock stores", () => {
    const [group] = summarizeCompetitors(healthyPanel(), now);
    expect(group).toMatchObject({ count: 3, medianDeliveredPrice: 15000, min: 13000, max: 17000, pairedCount: 3 });
    expect(group.label).toBe("토마토 · 대추방울 · 일반 · 2kg · 중과 (직경 40~50mm)");
    expect(group).toMatchObject({ sizeGrade: "MEDIUM", sizeCriteria: "직경 40~50mm" });
    const two = summarizeCompetitors(healthyPanel().slice(0, 2), now);
    expect(two[0]).toMatchObject({ count: 2, medianDeliveredPrice: null, min: null, max: null, previousWeekChangePct: null });
  });
  it("never counts the same store twice even if two entries slip through", () => {
    const dup = entry("a", [obs(0, 50000)]);
    const [group] = summarizeCompetitors([...healthyPanel().slice(0, 2), dup], now);
    expect(group.count).toBe(2);
    expect(group.medianDeliveredPrice).toBeNull();
  });
  it("excludes archived entries and unconfirmed variety from every group", () => {
    const archived = entry("d", [obs(0, 1000)], { archivedAt: at(1), archiveReason: "옵션 변경" });
    const unknown = entry("e", [obs(0, 1000)], { varietyGroup: "UNKNOWN" });
    const groups = summarizeCompetitors([...healthyPanel(), archived, unknown], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].min).toBe(13000);
  });
  it("splits groups by product, variety, quality and package weight", () => {
    const entries = [...healthyPanel(),
      entry("x", [obs(0, 1000)], { packageKg: 1 }),
      entry("y", [obs(0, 1000)], { qualityGroup: "GIFT" }),
      entry("z", [obs(0, 1000)], { varietyGroup: "ROUND" }),
      entry("w", [obs(0, 1000)], { productName: "딸기" })];
    const groups = summarizeCompetitors(entries, now);
    expect(groups.map(group => group.count)).toEqual([3, 1, 1, 1, 1]);
    expect(new Set(groups.map(group => group.key)).size).toBe(5);
  });
});

describe("size grade and confirmed size criteria", () => {
  it("excludes rows without a confirmed size entirely: legacy rows, UNKNOWN grade, blank criteria, unknown grade codes", () => {
    const excluded = [legacyEntry("d", [obs(0, 1000)]),
      entry("e", [obs(0, 1000)], { sizeGrade: "UNKNOWN" }),
      entry("f", [obs(0, 1000)], { sizeCriteria: "" }),
      entry("g", [obs(0, 1000)], { sizeCriteria: "   " }),
      entry("h", [obs(0, 1000)], { sizeGrade: "MEDIUM", sizeCriteria: undefined }),
      entry("i", [obs(0, 1000)], { sizeGrade: "JUMBO" }),
      entry("j", [obs(0, 1000)], { sizeGrade: "constructor" }), entry("k", [obs(0, 1000)], { sizeGrade: "__proto__" }), entry("l", [obs(0, 1000)], { sizeGrade: "toString" })];
    const groups = summarizeCompetitors([...healthyPanel(), ...excluded], now);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 3, min: 13000 });
    expect(summarizeCompetitors(excluded, now)).toEqual([]);
  });
  it("never compares small fruit with medium fruit even when every other attribute matches", () => {
    const small = [entry("s1", [obs(0, 5000)], { sizeGrade: "SMALL" }), entry("s2", [obs(0, 6000)], { sizeGrade: "SMALL" }), entry("s3", [obs(0, 7000)], { sizeGrade: "SMALL" })];
    const groups = summarizeCompetitors([...healthyPanel(), ...small], now);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => [g.sizeGrade, g.count, g.medianDeliveredPrice])).toEqual([["MEDIUM", 3, 15000], ["SMALL", 3, 9000]]);
    expect(groups[1].label).toContain("소과 (직경 40~50mm)");
  });
  it("splits the same grade by differing confirmed seller criteria instead of merging them", () => {
    const otherBoundary = [entry("p", [obs(0, 1000)], { sizeCriteria: "직경 45~55mm" }), entry("q", [obs(0, 1000)], { sizeCriteria: "1kg 25~30과" })];
    const groups = summarizeCompetitors([...healthyPanel(), ...otherBoundary], now);
    expect(groups.map(g => [g.sizeCriteria, g.count])).toEqual([["직경 40~50mm", 3], ["직경 45~55mm", 1], ["1kg 25~30과", 1]]);
    expect(new Set(groups.map(g => g.key)).size).toBe(3);
  });
  it("normalizes criteria by trimming surrounding whitespace only, never by case or inner spacing", () => {
    const padded = entry("c", [obs(2, 14000), obs(9, 16000)], { sizeCriteria: "  직경 40~50mm\t" });
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), padded], now)).toHaveLength(1);
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), padded], now)[0].count).toBe(3);
    const innerSpacing = entry("c", [obs(2, 14000)], { sizeCriteria: "직경 40 ~ 50mm" });
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), innerSpacing], now)).toHaveLength(2);
    const upper = entry("c", [obs(2, 14000)], { sizeCriteria: "직경 40~50MM" });
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), upper], now)).toHaveLength(2);
  });
});

describe("observation exclusions (never zero, never stale)", () => {
  it("drops out-of-stock, unknown availability, unknown shipping and non-positive prices from the current panel", () => {
    const entries = [...healthyPanel(),
      entry("d", [obs(0, 100, 0, "OUT_OF_STOCK")]),
      entry("e", [obs(0, 100, 0, "UNKNOWN")]),
      entry("f", [obs(0, 100, null)]),
      entry("g", [obs(0, 0, 0)]),
      entry("h", [obs(0, null, 0)])];
    const [group] = summarizeCompetitors(entries, now);
    expect(group.count).toBe(3);
    expect(group.min).toBe(13000);
  });
  it("uses only the latest observation per store, so a newer stock-out hides an older price", () => {
    const soldOut = entry("c", [obs(0, null, null, "OUT_OF_STOCK"), obs(1, 14000)]);
    const [group] = summarizeCompetitors([...healthyPanel().slice(0, 2), soldOut], now);
    expect(group.count).toBe(2);
    expect(group.medianDeliveredPrice).toBeNull();
  });
  it("treats observations older than seven days as stale but keeps exactly seven days", () => {
    const boundary = entry("c", [obs(7, 14000)]);
    const stale = entry("c", [obs(7, 14000, 3000, "IN_STOCK", -1)]);
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), boundary], now)[0].count).toBe(3);
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), stale], now)[0].count).toBe(2);
  });
  it("ignores observations dated after the evaluation time instead of treating them as current", () => {
    const future = entry("c", [obs(-1, 99999), obs(1, 14000)]);
    const [group] = summarizeCompetitors([...healthyPanel().slice(0, 2), future], now);
    expect(group.max).toBe(17000);
  });
  it("prefers the later-listed observation when two share the same observedAt (stable sort)", () => {
    const corrected = obs(0, 14000, 3000, "IN_STOCK", 0);
    const wrong = { ...obs(0, 99999, 3000, "IN_STOCK", 0), observedAt: corrected.observedAt };
    const [group] = summarizeCompetitors([...healthyPanel().slice(0, 2), entry("c", [corrected, wrong])], now);
    expect(group.max).toBe(17000);
  });
  it("does not mutate the entries or their observation arrays", () => {
    const entries = healthyPanel();
    const snapshot = JSON.stringify(entries);
    summarizeCompetitors(entries, now);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});

describe("previous-week matched panel", () => {
  it("compares medians of the same stores only and needs three pairs", () => {
    const [group] = summarizeCompetitors(healthyPanel(), now);
    // current paired [13000,15000,17000] vs prior [12000,15000,19000]
    expect(group.pairedCount).toBe(3);
    expect(group.previousWeekChangePct).toBeCloseTo(0);
    const cheaper = [entry("a", [obs(0, 8000), obs(7, 10000)]), entry("b", [obs(0, 8000), obs(7, 10000)]), entry("c", [obs(0, 8000), obs(7, 10000)])];
    expect(summarizeCompetitors(cheaper, now)[0].previousWeekChangePct).toBeCloseTo(-15.3846, 3);
  });
  it("withholds the change when only two stores have a valid prior observation", () => {
    const entries = [...healthyPanel().slice(0, 2), entry("c", [obs(0, 14000)])];
    const [group] = summarizeCompetitors(entries, now);
    expect(group.count).toBe(3);
    expect(group.medianDeliveredPrice).toBe(15000);
    expect(group.pairedCount).toBe(2);
    expect(group.previousWeekChangePct).toBeNull();
  });
  it("uses the latest observation at or before seven days ago and rejects a prior older than fourteen days", () => {
    const priorTooOld = entry("c", [obs(0, 14000), obs(14, 14000, 3000, "IN_STOCK", -1)]);
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), priorTooOld], now)[0].pairedCount).toBe(2);
    const priorAtEdge = entry("c", [obs(0, 14000), obs(14, 14000)]);
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), priorAtEdge], now)[0].pairedCount).toBe(3);
  });
  it("does not let a recent observation leak into the prior window", () => {
    // Only observations at or before now-7d qualify as prior; a 6-day-old price is current, not prior.
    const onlyRecent = entry("c", [obs(0, 14000), obs(6, 14000)]);
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), onlyRecent], now)[0].pairedCount).toBe(2);
  });
  it("excludes a store from the pair when its prior observation was out of stock or unknown shipping", () => {
    const soldOutBefore = entry("c", [obs(0, 14000), obs(7, null, null, "OUT_OF_STOCK")]);
    const unknownShipBefore = entry("c", [obs(0, 14000), obs(7, 14000, null)]);
    for (const variant of [soldOutBefore, unknownShipBefore]) {
      const [group] = summarizeCompetitors([...healthyPanel().slice(0, 2), variant], now);
      expect(group.pairedCount).toBe(2);
      expect(group.previousWeekChangePct).toBeNull();
    }
  });
  it("does not pair a store whose current observation is missing even when its prior exists", () => {
    const noCurrent = entry("c", [obs(7, 14000)]);
    const priorOnly = entry("c", [obs(8, 14000)]);
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), noCurrent], now)[0].pairedCount).toBe(3);
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), priorOnly], now)[0]).toMatchObject({ count: 2, pairedCount: 2 });
  });
  it("returns an empty list without groups for an empty or fully-archived panel", () => {
    expect(summarizeCompetitors([], now)).toEqual([]);
    expect(summarizeCompetitors([entry("a", [obs(0, 1)], { archivedAt: at(0) })], now)).toEqual([]);
  });
});
