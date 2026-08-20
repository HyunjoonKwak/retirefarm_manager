import { describe, it, expect } from "vitest";
import {
  summarizeSnapshotRows,
  SNAPSHOT_STALE_HOURS,
} from "@/lib/services/external-snapshot";
import { assetHubSnapshotSchema } from "@/lib/api/asset-hub-snapshot";

const NOW = new Date("2026-08-20T12:00:00+09:00");

function row(overrides: {
  source: string;
  category: string;
  valueKrw: number | bigint;
  asOfHoursAgo?: number;
  label?: string;
}) {
  const asOfHoursAgo = overrides.asOfHoursAgo ?? 1;
  return {
    source: overrides.source,
    category: overrides.category,
    label: overrides.label ?? overrides.category,
    valueKrw: BigInt(overrides.valueKrw),
    asOf: new Date(NOW.getTime() - asOfHoursAgo * 60 * 60 * 1000),
    collectedAt: NOW,
  };
}

describe("summarizeSnapshotRows", () => {
  it("소스별 소계와 전체 합계를 계산한다", () => {
    const rows = [
      row({ source: "portfolio_manager", category: "pension_dc", valueKrw: 100 }),
      row({ source: "portfolio_manager", category: "stock_kr", valueKrw: 50 }),
      row({ source: "asset_manager", category: "real_estate", valueKrw: 1000 }),
    ];

    const { totalKrw, sources } = summarizeSnapshotRows(rows, NOW);

    expect(totalKrw).toBe(1150);
    expect(sources).toHaveLength(2);

    const portfolio = sources.find((s) => s.source === "portfolio_manager");
    expect(portfolio?.subtotalKrw).toBe(150);
    expect(portfolio?.items).toHaveLength(2);

    const asset = sources.find((s) => s.source === "asset_manager");
    expect(asset?.subtotalKrw).toBe(1000);
  });

  it("소스는 이름순으로 정렬된다", () => {
    const rows = [
      row({ source: "portfolio_manager", category: "isa", valueKrw: 1 }),
      row({ source: "asset_manager", category: "real_estate", valueKrw: 2 }),
    ];

    const { sources } = summarizeSnapshotRows(rows, NOW);
    expect(sources.map((s) => s.source)).toEqual([
      "asset_manager",
      "portfolio_manager",
    ]);
  });

  it("as_of가 48시간 이내면 stale이 아니다", () => {
    const rows = [
      row({
        source: "asset_manager",
        category: "real_estate",
        valueKrw: 1,
        asOfHoursAgo: SNAPSHOT_STALE_HOURS - 1,
      }),
    ];

    const { sources } = summarizeSnapshotRows(rows, NOW);
    expect(sources[0].stale).toBe(false);
  });

  it("as_of가 48시간을 넘으면 stale로 표시하고 일수를 계산한다", () => {
    const rows = [
      row({
        source: "asset_manager",
        category: "real_estate",
        valueKrw: 1,
        asOfHoursAgo: 24 * 3 + 1, // 3일 하고 1시간 전
      }),
    ];

    const { sources } = summarizeSnapshotRows(rows, NOW);
    expect(sources[0].stale).toBe(true);
    expect(sources[0].asOfDaysAgo).toBe(3);
  });

  it("한 소스에 여러 as_of가 있으면 최신 값을 소스 기준시각으로 쓴다", () => {
    const rows = [
      row({
        source: "portfolio_manager",
        category: "stock_kr",
        valueKrw: 1,
        asOfHoursAgo: 100,
      }),
      row({
        source: "portfolio_manager",
        category: "isa",
        valueKrw: 1,
        asOfHoursAgo: 1,
      }),
    ];

    const { sources } = summarizeSnapshotRows(rows, NOW);
    expect(sources[0].stale).toBe(false);
  });

  it("빈 입력이면 합계 0, 소스 없음", () => {
    const { totalKrw, sources } = summarizeSnapshotRows([], NOW);
    expect(totalKrw).toBe(0);
    expect(sources).toEqual([]);
  });
});

describe("assetHubSnapshotSchema (§2.2 계약)", () => {
  const valid = {
    schema_version: 1,
    source: "asset_manager",
    as_of: "2026-08-20T09:00:00+09:00",
    base_currency: "KRW",
    items: [{ category: "real_estate", label: "부동산", value_krw: 4450000000 }],
  };

  it("계약을 따르는 응답을 통과시킨다", () => {
    expect(assetHubSnapshotSchema.safeParse(valid).success).toBe(true);
  });

  it("USD original이 있는 항목을 통과시킨다", () => {
    const withOriginal = {
      ...valid,
      items: [
        {
          category: "stock_us",
          label: "해외주식",
          value_krw: 3456789,
          original: {
            currency: "USD",
            value: 2500.0,
            fx_rate: 1382.7,
            fx_as_of: "2026-08-19",
          },
        },
      ],
    };
    expect(assetHubSnapshotSchema.safeParse(withOriginal).success).toBe(true);
  });

  it("schema_version이 다르면 거부한다", () => {
    expect(
      assetHubSnapshotSchema.safeParse({ ...valid, schema_version: 2 }).success
    ).toBe(false);
  });

  it("value_krw가 정수가 아니면 거부한다 (§2.2: 정수 원)", () => {
    const fractional = {
      ...valid,
      items: [{ category: "real_estate", label: "부동산", value_krw: 100.5 }],
    };
    expect(assetHubSnapshotSchema.safeParse(fractional).success).toBe(false);
  });

  it("base_currency가 KRW가 아니면 거부한다", () => {
    expect(
      assetHubSnapshotSchema.safeParse({ ...valid, base_currency: "USD" }).success
    ).toBe(false);
  });
});
