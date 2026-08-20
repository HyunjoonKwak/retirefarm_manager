import { describe, it, expect } from "vitest";
import {
  hubNetWorthSchema,
  checkNetWorthIdentity,
  type HubNetWorth,
} from "@/lib/api/asset-hub-snapshot";

const valid: HubNetWorth = {
  schema_version: 1,
  source: "my_portal",
  as_of: "2026-08-20T09:00:00+09:00",
  base_currency: "KRW",
  net_worth_krw: 4_250_000_000,
  assets: [
    {
      category: "cash_bank",
      label: "예금·입출금",
      value_krw: 120_000_000,
      origin: "my_portal",
    },
    {
      category: "real_estate",
      label: "부동산",
      value_krw: 4_450_000_000,
      origin: "asset_manager",
    },
    {
      category: "pension_dc",
      label: "퇴직연금 DC",
      value_krw: 456_000_000,
      origin: "portfolio_manager",
    },
  ],
  liabilities: [
    { category: "card_debt", label: "카드 미결제", value_krw: 12_000_000 },
    { category: "loan", label: "대출 잔액", value_krw: 764_000_000 },
  ],
  sources: [
    { source: "asset_manager", as_of: "2026-06-12T18:32:31+09:00", stale: true },
    { source: "portfolio_manager", as_of: "2026-08-20T09:00:00+09:00", stale: false },
  ],
};

describe("hubNetWorthSchema (§2.4 계약)", () => {
  it("계약을 따르는 응답을 통과시킨다", () => {
    expect(hubNetWorthSchema.safeParse(valid).success).toBe(true);
  });

  it("sources가 없으면 빈 배열로 채운다", () => {
    const { sources: _omitted, ...withoutSources } = valid;
    const parsed = hubNetWorthSchema.safeParse(withoutSources);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.sources).toEqual([]);
  });

  it("source가 my_portal이 아니면 거부한다 (부분 소스 직접 소비 방지)", () => {
    expect(
      hubNetWorthSchema.safeParse({ ...valid, source: "portfolio_manager" }).success
    ).toBe(false);
  });

  it("부채가 음수면 거부한다 (§2.4 부호 규칙: 양수 표현)", () => {
    const negative = {
      ...valid,
      liabilities: [{ category: "loan", label: "대출", value_krw: -764_000_000 }],
    };
    expect(hubNetWorthSchema.safeParse(negative).success).toBe(false);
  });

  it("자산 항목에 origin이 없으면 거부한다 (딥링크 근거)", () => {
    const noOrigin = {
      ...valid,
      assets: [{ category: "cash_bank", label: "예금", value_krw: 1 }],
    };
    expect(hubNetWorthSchema.safeParse(noOrigin).success).toBe(false);
  });

  it("net_worth_krw가 정수가 아니면 거부한다", () => {
    expect(
      hubNetWorthSchema.safeParse({ ...valid, net_worth_krw: 100.5 }).success
    ).toBe(false);
  });

  it("net_worth_krw는 음수를 허용한다 (부채 초과 상태)", () => {
    const parsed = hubNetWorthSchema.safeParse({
      ...valid,
      net_worth_krw: -5_000_000,
    });
    expect(parsed.success).toBe(true);
  });

  it("schema_version이 다르면 거부한다", () => {
    expect(
      hubNetWorthSchema.safeParse({ ...valid, schema_version: 2 }).success
    ).toBe(false);
  });

  it("base_currency가 KRW가 아니면 거부한다", () => {
    expect(
      hubNetWorthSchema.safeParse({ ...valid, base_currency: "USD" }).success
    ).toBe(false);
  });
});

describe("checkNetWorthIdentity", () => {
  it("Σassets − Σliabilities === net_worth_krw이면 참", () => {
    // 120,000,000 + 4,450,000,000 + 456,000,000 − 12,000,000 − 764,000,000
    expect(valid.net_worth_krw).toBe(4_250_000_000);
    expect(checkNetWorthIdentity(valid)).toBe(true);
  });

  it("항등식이 어긋나면 거짓 (값을 고치지는 않는다)", () => {
    const broken = { ...valid, net_worth_krw: 4_900_000_000 };
    expect(checkNetWorthIdentity(broken)).toBe(false);
    // 계약값은 그대로 유지된다 — 소비자는 재계산하지 않는다
    expect(broken.net_worth_krw).toBe(4_900_000_000);
  });

  it("자산·부채가 비어도 0으로 성립한다", () => {
    expect(
      checkNetWorthIdentity({
        ...valid,
        assets: [],
        liabilities: [],
        net_worth_krw: 0,
      })
    ).toBe(true);
  });
});
