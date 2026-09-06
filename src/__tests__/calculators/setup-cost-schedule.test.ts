import { describe, it, expect } from "vitest";
import { scheduleSetupCosts } from "@/lib/calculators/setup-cost-schedule";

// 예측 시작: 2026-09 (호출 시각은 9월 중순)
const projectionStart = new Date(2026, 8, 15);

describe("scheduleSetupCosts", () => {
  it("plannedDate가 예측 구간 안이면 그 날짜에 계상한다", () => {
    const result = scheduleSetupCosts(
      [{ name: "하우스", estimatedCost: 10_000_000, plannedDate: new Date(2026, 10, 5) }],
      { projectionStart }
    );
    expect(result.costs).toHaveLength(1);
    expect(result.costs[0].expectedDate).toEqual(new Date(2026, 10, 5));
    expect(result.costs[0].source).toBe("planned");
    expect(result.assumptions.scheduledAmount).toBe(10_000_000);
  });

  it("plannedDate가 과거이고 미지출이면 예측 첫 달로 끌어온다 (누락 방지)", () => {
    const result = scheduleSetupCosts(
      [{ name: "토지", estimatedCost: 50_000_000, plannedDate: new Date(2026, 5, 1) }],
      { projectionStart }
    );
    expect(result.costs[0].expectedDate).toEqual(new Date(2026, 8, 1));
    expect(result.costs[0].source).toBe("overdue");
    expect(result.assumptions.overdueCount).toBe(1);
  });

  it("plannedDate가 없으면 예측 첫 달로 폴백하고 가정을 남긴다 (기존 행 = 등록일로 추정하지 않음)", () => {
    const result = scheduleSetupCosts([{ name: "장비", estimatedCost: 3_000_000 }], {
      projectionStart,
    });
    expect(result.costs[0].expectedDate).toEqual(new Date(2026, 8, 1));
    expect(result.costs[0].source).toBe("fallback");
    expect(result.assumptions).toMatchObject({
      fallbackMonth: "2026-09",
      fallbackReason: "projectionStart",
      undatedCount: 1,
    });
  });

  it("영농 시작일이 예측 구간 안이면 미지정 항목은 그 달로 폴백한다", () => {
    const result = scheduleSetupCosts([{ name: "장비", estimatedCost: 3_000_000 }], {
      projectionStart,
      farmStartDate: new Date(2027, 2, 10),
    });
    expect(result.costs[0].expectedDate).toEqual(new Date(2027, 2, 1));
    expect(result.assumptions).toMatchObject({
      fallbackMonth: "2027-03",
      fallbackReason: "farmStartDate",
    });
  });

  it("영농 시작일이 과거면 예측 첫 달로 폴백한다", () => {
    const result = scheduleSetupCosts([{ name: "장비", estimatedCost: 3_000_000 }], {
      projectionStart,
      farmStartDate: new Date(2026, 1, 1),
    });
    expect(result.assumptions.fallbackReason).toBe("projectionStart");
  });

  it("paidAt이 있으면 미래 유출에서 제외하고 집계만 남긴다", () => {
    const result = scheduleSetupCosts(
      [
        { name: "지출완료", estimatedCost: 4_000_000, paidAt: new Date(2026, 7, 1) },
        { name: "예정", estimatedCost: 1_000_000, quantity: 2, subsidyAmount: 500_000 },
      ],
      { projectionStart }
    );
    expect(result.costs.map((c) => c.description)).toEqual(["예정"]);
    expect(result.costs[0].amount).toBe(1_500_000);
    expect(result.assumptions.paidCount).toBe(1);
    expect(result.assumptions.paidAmount).toBe(4_000_000);
  });

  it("보조금 차감 후 0 이하인 항목은 제외한다", () => {
    const result = scheduleSetupCosts(
      [{ name: "전액보조", estimatedCost: 1_000_000, subsidyAmount: 1_000_000 }],
      { projectionStart }
    );
    expect(result.costs).toHaveLength(0);
  });
});

it("예측 범위 밖 영농 시작일은 날짜 미정 설립비를 예측에서 누락시키지 않는다", () => {
  const result = scheduleSetupCosts([{ name: "미지출 시설", estimatedCost: 1000 }], {
    projectionStart: new Date(2026, 8, 1), farmStartDate: new Date(2028, 1, 1), projectionMonths: 12,
  });
  expect(result.costs[0].expectedDate).toEqual(new Date(2026, 8, 1));
  expect(result.assumptions.fallbackReason).toBe("projectionStart");
});
