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
    sizeGrade: "MEDIUM", sizeCriteria: "직경 40~50mm", cultivarName: "대저", color: "RED", mixture: "SINGLE", processing: "FRESH",
    archivedAt: null, archiveReason: null, observations, ...overrides };
}
/** A row serialized before the size columns existed: no sizeGrade/sizeCriteria keys at all (identity keys are absent too). */
function legacyEntry(storeKey: string, observations: CompetitorObservation[]): CompetitorEntry {
  const legacy: CompetitorEntry = { ...entry(storeKey, observations) };
  delete legacy.sizeGrade; delete legacy.sizeCriteria;
  delete legacy.cultivarName; delete legacy.color; delete legacy.mixture; delete legacy.processing;
  return legacy;
}
/** A row serialized after the size columns but before the identity columns existed: size confirmed, identity keys absent. */
function preIdentityEntry(storeKey: string, observations: CompetitorObservation[]): CompetitorEntry {
  const row: CompetitorEntry = { ...entry(storeKey, observations) };
  delete row.cultivarName; delete row.color; delete row.mixture; delete row.processing;
  return row;
}
const LABEL = "토마토 · 대추방울 · 대저 · 빨강 · 단일 · 무가공 생과 · 일반 · 2kg · 중과 (직경 40~50mm)";
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
    expect(group.label).toBe(LABEL);
    expect(group).toMatchObject({ sizeGrade: "MEDIUM", sizeCriteria: "직경 40~50mm", cultivarName: "대저", color: "RED", mixture: "SINGLE", processing: "FRESH" });
    const two = summarizeCompetitors(healthyPanel().slice(0, 2), now);
    expect(two[0]).toMatchObject({ count: 2, medianDeliveredPrice: null, min: null, max: null, previousWeekChangePct: null });
  });
  it("never counts the same store twice even when it has several options in the group", () => {
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

describe("confirmed option identity (cultivar, color, mixture, processing)", () => {
  it("excludes every row whose identity is not fully confirmed: legacy rows, pre-identity rows, empty cultivar, UNKNOWN/OTHER/MIXED codes", () => {
    const excluded = [legacyEntry("d", [obs(0, 1000)]), preIdentityEntry("e", [obs(0, 1000)]),
      entry("f", [obs(0, 1000)], { cultivarName: "" }), entry("g", [obs(0, 1000)], { cultivarName: "   \t" }), entry("h", [obs(0, 1000)], { cultivarName: undefined }),
      entry("i", [obs(0, 1000)], { color: "UNKNOWN" }), entry("j", [obs(0, 1000)], { color: "OTHER" }), entry("k", [obs(0, 1000)], { color: undefined }),
      entry("l", [obs(0, 1000)], { mixture: "UNKNOWN" }), entry("m", [obs(0, 1000)], { mixture: "MIXED" }), entry("n", [obs(0, 1000)], { mixture: undefined }),
      entry("o", [obs(0, 1000)], { processing: "UNKNOWN" }), entry("p", [obs(0, 1000)], { processing: "OTHER" }), entry("q", [obs(0, 1000)], { processing: undefined }),
      entry("r", [obs(0, 1000)], { color: "PINK" }), entry("s", [obs(0, 1000)], { mixture: "single" }), entry("t", [obs(0, 1000)], { processing: "SUGAR" }),
      entry("u", [obs(0, 1000)], { color: "constructor" }), entry("v", [obs(0, 1000)], { mixture: "__proto__" }), entry("w", [obs(0, 1000)], { processing: "toString" })];
    const groups = summarizeCompetitors([...healthyPanel(), ...excluded], now);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 3, min: 13000 });
    expect(summarizeCompetitors(excluded, now)).toEqual([]);
  });
  it("never lets an unconfirmed identity join a confirmed group even when the panel would otherwise reach three stores", () => {
    const twoConfirmed = healthyPanel().slice(0, 2);
    for (const third of [preIdentityEntry("c", [obs(2, 14000)]), entry("c", [obs(2, 14000)], { cultivarName: "" }),
      entry("c", [obs(2, 14000)], { color: "OTHER" }), entry("c", [obs(2, 14000)], { mixture: "MIXED" }), entry("c", [obs(2, 14000)], { processing: "OTHER" })]) {
      const groups = summarizeCompetitors([...twoConfirmed, third], now);
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ count: 2, medianDeliveredPrice: null });
    }
  });
  it("keeps red and orange fruit in separate groups even when every other attribute matches", () => {
    const orange = [entry("o1", [obs(0, 5000)], { color: "ORANGE" }), entry("o2", [obs(0, 6000)], { color: "ORANGE" }), entry("o3", [obs(0, 7000)], { color: "ORANGE" })];
    const groups = summarizeCompetitors([...healthyPanel(), ...orange], now);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => [g.color, g.count, g.medianDeliveredPrice])).toEqual([["RED", 3, 15000], ["ORANGE", 3, 9000]]);
    expect(groups[1].label).toBe("토마토 · 대추방울 · 대저 · 주황 · 단일 · 무가공 생과 · 일반 · 2kg · 중과 (직경 40~50mm)");
    expect(new Set(groups.map(g => g.key)).size).toBe(2);
  });
  it("splits differing cultivar names instead of merging them, with no alias or similarity matching", () => {
    const others = [entry("p", [obs(0, 1000)], { cultivarName: "스텔라" }), entry("q", [obs(0, 1000)], { cultivarName: "대저토마토" }), entry("r", [obs(0, 1000)], { cultivarName: "대 저" })];
    const groups = summarizeCompetitors([...healthyPanel(), ...others], now);
    expect(groups.map(g => [g.cultivarName, g.count])).toEqual([["대저", 3], ["스텔라", 1], ["대저토마토", 1], ["대 저", 1]]);
    expect(new Set(groups.map(g => g.key)).size).toBe(4);
  });
  it("keeps fresh, stevia and xylitol processing apart as distinct comparable groups", () => {
    const stevia = [entry("s1", [obs(0, 20000)], { processing: "STEVIA" }), entry("s2", [obs(0, 21000)], { processing: "STEVIA" }), entry("s3", [obs(0, 22000)], { processing: "STEVIA" })];
    const xylitol = [entry("x1", [obs(0, 30000)], { processing: "XYLITOL" })];
    const groups = summarizeCompetitors([...healthyPanel(), ...stevia, ...xylitol], now);
    expect(groups.map(g => [g.processing, g.count, g.medianDeliveredPrice])).toEqual([["FRESH", 3, 15000], ["STEVIA", 3, 24000], ["XYLITOL", 1, null]]);
    expect(groups[1].label).toContain("스테비아");
    expect(groups[2].label).toContain("자일리톨");
  });
  it("accepts every specific color and only SINGLE mixture as comparable", () => {
    const colors = ["RED", "ORANGE", "YELLOW", "GREEN", "BROWN"];
    const groups = summarizeCompetitors(colors.map((color, i) => entry(`c${i}`, [obs(0, 1000)], { color })), now);
    expect(groups.map(g => g.color)).toEqual(colors);
    expect(groups.map(g => g.mixture)).toEqual(colors.map(() => "SINGLE"));
    expect(groups[4].label).toContain("갈색");
  });
  it("normalizes the cultivar name by trimming surrounding whitespace only, never by case or inner spacing", () => {
    const padded = entry("c", [obs(2, 14000), obs(9, 16000)], { cultivarName: "  대저\t" });
    const groups = summarizeCompetitors([...healthyPanel().slice(0, 2), padded], now);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 3, cultivarName: "대저" });
    const innerSpacing = entry("c", [obs(2, 14000)], { cultivarName: "대 저" });
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), innerSpacing], now)).toHaveLength(2);
    const lower = [entry("a", [obs(0, 1000)], { cultivarName: "Stella" }), entry("b", [obs(0, 1000)], { cultivarName: "stella" })];
    expect(summarizeCompetitors(lower, now)).toHaveLength(2);
  });
  it("still applies the three-store and paired-week thresholds inside an identity group", () => {
    const [group] = summarizeCompetitors(healthyPanel(), now);
    expect(group).toMatchObject({ count: 3, pairedCount: 3, medianDeliveredPrice: 15000 });
    const twoPaired = [...healthyPanel().slice(0, 2), entry("c", [obs(0, 14000)])];
    expect(summarizeCompetitors(twoPaired, now)[0]).toMatchObject({ count: 3, pairedCount: 2, previousWeekChangePct: null });
    const dup = entry("a", [obs(0, 50000)]);
    expect(summarizeCompetitors([...healthyPanel().slice(0, 2), dup], now)[0]).toMatchObject({ count: 2, medianDeliveredPrice: null });
  });
});

describe("one sample per store across several options", () => {
  /** Two stores at the baseline plus one store with two options, so the chosen option decides count 3 and min/max. */
  const two = () => healthyPanel().slice(0, 2);
  it("chooses the option with the latest eligible observation, not the cheapest one", () => {
    const cheapOld = entry("c", [obs(3, 5000)], { id: "e-c-cheap" });
    const pricyNew = entry("c", [obs(1, 30000)], { id: "e-c-pricy" });
    for (const order of [[cheapOld, pricyNew], [pricyNew, cheapOld]]) {
      const [group] = summarizeCompetitors([...two(), ...order], now);
      expect(group).toMatchObject({ count: 3, max: 33000, min: 13000, medianDeliveredPrice: 15000 });
    }
  });
  it("breaks an observedAt tie by the smaller entry id regardless of input order or price", () => {
    const smallerId = entry("c", [obs(1, 40000)], { id: "e-c-1" });
    const largerId = entry("c", [obs(1, 20000)], { id: "e-c-2" });
    for (const order of [[smallerId, largerId], [largerId, smallerId]]) {
      const [group] = summarizeCompetitors([...two(), ...order], now);
      expect(group).toMatchObject({ count: 3, max: 43000 });
    }
  });
  it("lets a valid option stand in when the store's other option is out of stock, unknown, unpriced, stale or unrecorded", () => {
    const valid = entry("c", [obs(2, 14000)], { id: "e-c-valid" });
    const shadows = [entry("c", [obs(0, null, null, "OUT_OF_STOCK")], { id: "e-c-a" }), entry("c", [obs(0, 100, 0, "UNKNOWN")], { id: "e-c-b" }),
      entry("c", [obs(0, 100, null)], { id: "e-c-c" }), entry("c", [obs(0, 0, 0)], { id: "e-c-d" }), entry("c", [obs(8, 100)], { id: "e-c-e" }),
      entry("c", [], { id: "e-c-f" }), entry("c", [obs(-1, 99999)], { id: "e-c-g" })];
    for (const shadow of shadows) {
      const [group] = summarizeCompetitors([...two(), shadow, valid], now);
      expect(group, shadow.id).toMatchObject({ count: 3, max: 17000, medianDeliveredPrice: 15000 });
    }
    const [group] = summarizeCompetitors([...two(), ...shadows, valid], now);
    expect(group).toMatchObject({ count: 3, max: 17000 });
    expect(summarizeCompetitors([...two(), ...shadows], now)[0]).toMatchObject({ count: 2, medianDeliveredPrice: null });
  });
  it("still lets a newer stock-out hide the older price of the same option", () => {
    const soldOut = entry("c", [obs(0, null, null, "OUT_OF_STOCK"), obs(1, 14000)], { id: "e-c-soldout" });
    expect(summarizeCompetitors([...two(), soldOut], now)[0]).toMatchObject({ count: 2, medianDeliveredPrice: null });
    const sibling = entry("c", [obs(3, 14000)], { id: "e-c-sibling" });
    expect(summarizeCompetitors([...two(), soldOut, sibling], now)[0]).toMatchObject({ count: 3, max: 17000 });
  });
  it("pairs the prior week with the very same selected option, never with a sibling option's prior", () => {
    // Selected (latest) option has no prior; the sibling has one: the store must not be paired.
    const selectedNoPrior = entry("c", [obs(0, 14000)], { id: "e-c-selected" });
    const siblingWithPrior = entry("c", [obs(3, 14000), obs(7, 16000)], { id: "e-c-sibling" });
    const [unpaired] = summarizeCompetitors([...two(), selectedNoPrior, siblingWithPrior], now);
    expect(unpaired).toMatchObject({ count: 3, max: 17000, pairedCount: 2, previousWeekChangePct: null });
    // Selected option has its own prior: paired with that prior, and the sibling's prior is ignored.
    const selectedWithPrior = entry("c", [obs(0, 14000), obs(7, 16000)], { id: "e-c-selected" });
    const siblingOtherPrior = entry("c", [obs(3, 14000), obs(7, 1000)], { id: "e-c-sibling" });
    const [paired] = summarizeCompetitors([...two(), selectedWithPrior, siblingOtherPrior], now);
    expect(paired).toMatchObject({ count: 3, pairedCount: 3 });
    // current paired [13000,15000,17000] vs prior [12000,15000,19000] -> 0%, exactly like the healthy panel
    expect(paired.previousWeekChangePct).toBeCloseTo(0);
  });
  it("selects per group, so one store can contribute to two different weight groups with different options", () => {
    const heavy = [entry("a", [obs(0, 20000)], { packageKg: 5 }), entry("b", [obs(0, 22000)], { packageKg: 5 }), entry("c", [obs(0, 24000)], { packageKg: 5 })];
    const groups = summarizeCompetitors([...healthyPanel(), ...heavy], now);
    expect(groups.map(g => [g.packageKg, g.count, g.medianDeliveredPrice])).toEqual([[2, 3, 15000], [5, 3, 25000]]);
  });
  it("keeps identity gating per option: an unconfirmed sibling never joins, and a confirmed sibling of another identity forms its own group", () => {
    const unconfirmed = entry("c", [obs(0, 14000)], { cultivarName: "", id: "e-c-unconfirmed" });
    const orange = entry("c", [obs(0, 14000)], { color: "ORANGE", id: "e-c-orange" });
    const groups = summarizeCompetitors([...two(), unconfirmed, orange], now);
    expect(groups.map(g => [g.color, g.count, g.medianDeliveredPrice])).toEqual([["RED", 2, null], ["ORANGE", 1, null]]);
  });
  it("keeps the three-store threshold: three options of one store are still one store", () => {
    const options = [entry("a", [obs(0, 10000)], { id: "e-a-1" }), entry("a", [obs(0, 12000)], { id: "e-a-2" }), entry("a", [obs(0, 14000)], { id: "e-a-3" })];
    expect(summarizeCompetitors(options, now)[0]).toMatchObject({ count: 1, medianDeliveredPrice: null, pairedCount: 0 });
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
