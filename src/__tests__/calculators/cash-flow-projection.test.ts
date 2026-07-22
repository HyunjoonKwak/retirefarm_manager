import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateCashFlowProjection,
  type ProjectionInput,
} from "@/lib/calculators/cash-flow-projection";

// 기준 시각: 2026-03-10 (로컬) → 예측 시작 월 = 2026-03
const SYSTEM_TIME = new Date(2026, 2, 10, 12, 0, 0);

const emptyInput: ProjectionInput = {
  fundingSources: [],
  setupCosts: [],
};

describe("generateCashFlowProjection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SYSTEM_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("기본 동작", () => {
    it("빈 입력이면 기본 24개월의 0원 예측을 생성한다", () => {
      const result = generateCashFlowProjection(emptyInput);

      expect(result.projections).toHaveLength(24);
      expect(result.projections[0].month).toBe("2026-03");
      expect(result.projections[0].year).toBe(2026);
      expect(result.projections[0].monthNum).toBe(3);
      expect(result.projections[23].month).toBe("2028-02");
      expect(result.projections.every((p) => p.totalInflow === 0)).toBe(true);
      expect(result.projections.every((p) => p.totalOutflow === 0)).toBe(true);
      expect(result.projections.every((p) => p.cumulativeCashFlow === 0)).toBe(true);
      expect(result.summary.totalInflow).toBe(0);
      expect(result.summary.totalOutflow).toBe(0);
      expect(result.summary.netCashFlow).toBe(0);
      expect(result.summary.breakEvenMonth).toBeUndefined();
    });

    it("projectionMonths를 지정하면 해당 개월 수만큼 생성한다", () => {
      const result = generateCashFlowProjection({
        ...emptyInput,
        projectionMonths: 3,
      });

      expect(result.projections).toHaveLength(3);
      expect(result.projections.map((p) => p.month)).toEqual([
        "2026-03",
        "2026-04",
        "2026-05",
      ]);
    });

    it("initialCash가 누적 현금흐름의 시작값이 된다", () => {
      const result = generateCashFlowProjection({
        ...emptyInput,
        initialCash: 10_000_000,
        projectionMonths: 2,
      });

      expect(result.projections[0].cumulativeCashFlow).toBe(10_000_000);
      expect(result.projections[1].cumulativeCashFlow).toBe(10_000_000);
      expect(result.summary.lowestPoint.amount).toBe(10_000_000);
      expect(result.summary.highestPoint.amount).toBe(10_000_000);
    });

    it("projectionMonths가 0이면 안전한 기본값을 반환한다", () => {
      const result = generateCashFlowProjection({
        ...emptyInput,
        initialCash: 3_000_000,
        projectionMonths: 0,
      });

      expect(result.projections).toHaveLength(0);
      expect(result.summary.totalInflow).toBe(0);
      expect(result.summary.totalOutflow).toBe(0);
      expect(result.summary.netCashFlow).toBe(0);
      expect(result.summary.lowestPoint).toEqual({ month: "", amount: 3_000_000 });
      expect(result.summary.highestPoint).toEqual({ month: "", amount: 3_000_000 });
      expect(result.summary.breakEvenMonth).toBeUndefined();
    });
  });

  describe("자금 유입 / 설립 비용 배치", () => {
    it("유입과 유출을 해당 월에 배치하고 누적 흐름을 계산한다", () => {
      const result = generateCashFlowProjection({
        fundingSources: [
          {
            type: "대출",
            description: "농지 담보 대출",
            amount: 50_000_000,
            expectedDate: new Date(2026, 2, 15),
          },
        ],
        setupCosts: [
          {
            description: "토지 구입",
            amount: 30_000_000,
            expectedDate: new Date(2026, 3, 5),
          },
        ],
        projectionMonths: 3,
      });

      const [mar, apr, may] = result.projections;

      expect(mar.totalInflow).toBe(50_000_000);
      expect(mar.inflows).toHaveLength(1);
      expect(mar.inflows[0].type).toBe("대출");
      expect(mar.inflows[0].items).toEqual([
        { description: "농지 담보 대출", amount: 50_000_000 },
      ]);
      expect(mar.netCashFlow).toBe(50_000_000);
      expect(mar.cumulativeCashFlow).toBe(50_000_000);

      expect(apr.totalOutflow).toBe(30_000_000);
      expect(apr.outflows[0].type).toBe("설립비용");
      expect(apr.cumulativeCashFlow).toBe(20_000_000);

      expect(may.totalInflow).toBe(0);
      expect(may.cumulativeCashFlow).toBe(20_000_000);

      expect(result.summary.totalInflow).toBe(50_000_000);
      expect(result.summary.totalOutflow).toBe(30_000_000);
      expect(result.summary.netCashFlow).toBe(20_000_000);
      expect(result.summary.highestPoint).toEqual({
        month: "2026-03",
        amount: 50_000_000,
      });
      expect(result.summary.lowestPoint).toEqual({
        month: "2026-04",
        amount: 20_000_000,
      });
    });

    it("예측 기간 밖의 날짜는 어느 월에도 포함되지 않는다", () => {
      const result = generateCashFlowProjection({
        fundingSources: [
          {
            type: "예금",
            description: "과거 유입",
            amount: 10_000_000,
            expectedDate: new Date(2026, 1, 27), // 시작 월 이전
          },
          {
            type: "예금",
            description: "기간 이후 유입",
            amount: 20_000_000,
            expectedDate: new Date(2026, 6, 1), // 3개월 예측 범위 밖
          },
        ],
        setupCosts: [],
        projectionMonths: 3,
      });

      expect(result.summary.totalInflow).toBe(0);
    });

    it("말일에 시각이 포함된 날짜도 해당 월에 포함된다", () => {
      const result = generateCashFlowProjection({
        fundingSources: [
          {
            type: "예금",
            description: "말일 정오 유입",
            amount: 10_000_000,
            expectedDate: new Date(2026, 2, 31, 12, 0),
          },
          {
            type: "예금",
            description: "말일 자정 유입",
            amount: 5_000_000,
            expectedDate: new Date(2026, 2, 31),
          },
        ],
        setupCosts: [],
        projectionMonths: 2,
      });

      // 말일 항목이 시각과 무관하게 모두 3월에 포함된다
      expect(result.projections[0].totalInflow).toBe(15_000_000);
      expect(result.projections[1].totalInflow).toBe(0);
      expect(result.summary.totalInflow).toBe(15_000_000);
    });

    it("같은 type의 유입은 하나로 집계된다", () => {
      const result = generateCashFlowProjection({
        fundingSources: [
          {
            type: "예금",
            description: "정기예금 해지",
            amount: 10_000_000,
            expectedDate: new Date(2026, 2, 5),
          },
          {
            type: "예금",
            description: "적금 만기",
            amount: 20_000_000,
            expectedDate: new Date(2026, 2, 20),
          },
          {
            type: "대출",
            description: "신용 대출",
            amount: 5_000_000,
            expectedDate: new Date(2026, 2, 25),
          },
        ],
        setupCosts: [],
        projectionMonths: 1,
      });

      const mar = result.projections[0];
      expect(mar.inflows).toHaveLength(2);

      const deposit = mar.inflows.find((f) => f.type === "예금");
      expect(deposit?.amount).toBe(30_000_000);
      expect(deposit?.items).toHaveLength(2);
      expect(mar.totalInflow).toBe(35_000_000);
    });
  });

  describe("월 반복 비용", () => {
    it("운영비와 생활비가 매월 반복 유출된다", () => {
      const result = generateCashFlowProjection({
        ...emptyInput,
        monthlyOperatingCosts: 1_000_000,
        monthlyLivingExpense: 2_000_000,
        initialCash: 10_000_000,
        projectionMonths: 2,
      });

      for (const p of result.projections) {
        expect(p.totalOutflow).toBe(3_000_000);
        expect(p.outflows.find((o) => o.type === "운영비")?.amount).toBe(1_000_000);
        expect(p.outflows.find((o) => o.type === "생활비")?.amount).toBe(2_000_000);
      }

      expect(result.projections[0].cumulativeCashFlow).toBe(7_000_000);
      expect(result.projections[1].cumulativeCashFlow).toBe(4_000_000);
      expect(result.summary.totalOutflow).toBe(6_000_000);
      expect(result.summary.netCashFlow).toBe(-6_000_000);
    });

    it("운영비/생활비가 0이면 유출 항목이 생성되지 않는다", () => {
      const result = generateCashFlowProjection({
        ...emptyInput,
        monthlyOperatingCosts: 0,
        monthlyLivingExpense: 0,
        projectionMonths: 1,
      });

      expect(result.projections[0].outflows).toHaveLength(0);
    });
  });

  describe("영농 수입", () => {
    it("영농 시작일이 속한 월(1일 시작)부터 수입이 발생한다", () => {
      const result = generateCashFlowProjection({
        ...emptyInput,
        monthlyFarmIncome: 5_000_000,
        farmStartDate: new Date(2026, 3, 1),
        projectionMonths: 3,
      });

      expect(result.projections[0].totalInflow).toBe(0);
      expect(result.projections[1].totalInflow).toBe(5_000_000);
      expect(result.projections[1].inflows[0].type).toBe("영농수입");
      expect(result.projections[2].totalInflow).toBe(5_000_000);
    });

    it("월중 시작일이면 다음 달부터 수입이 발생한다", () => {
      // currentMonth(월 1일) >= farmStart 비교이므로 4/15 시작 시 4월은 제외된다
      const result = generateCashFlowProjection({
        ...emptyInput,
        monthlyFarmIncome: 5_000_000,
        farmStartDate: new Date(2026, 3, 15),
        projectionMonths: 3,
      });

      expect(result.projections[0].totalInflow).toBe(0);
      expect(result.projections[1].totalInflow).toBe(0);
      expect(result.projections[2].totalInflow).toBe(5_000_000);
    });

    it("farmStartDate가 없으면 수입이 발생하지 않는다", () => {
      const result = generateCashFlowProjection({
        ...emptyInput,
        monthlyFarmIncome: 5_000_000,
        projectionMonths: 2,
      });

      expect(result.summary.totalInflow).toBe(0);
    });

    it("monthlyFarmIncome이 0이면 시작일이 있어도 수입이 없다", () => {
      const result = generateCashFlowProjection({
        ...emptyInput,
        monthlyFarmIncome: 0,
        farmStartDate: new Date(2026, 2, 1),
        projectionMonths: 2,
      });

      expect(result.summary.totalInflow).toBe(0);
    });
  });

  describe("손익분기점", () => {
    it("누적 흐름이 음수에서 0 이상으로 전환되는 월을 찾는다", () => {
      const result = generateCashFlowProjection({
        fundingSources: [
          {
            type: "보조금",
            description: "정착 지원금",
            amount: 15_000_000,
            expectedDate: new Date(2026, 4, 10),
          },
        ],
        setupCosts: [
          {
            description: "설비 구입",
            amount: 10_000_000,
            expectedDate: new Date(2026, 2, 5),
          },
        ],
        projectionMonths: 4,
      });

      // 누적: -10M, -10M, +5M, +5M
      expect(result.projections.map((p) => p.cumulativeCashFlow)).toEqual([
        -10_000_000, -10_000_000, 5_000_000, 5_000_000,
      ]);
      expect(result.summary.breakEvenMonth).toBe("2026-05");
      expect(result.summary.lowestPoint).toEqual({
        month: "2026-03",
        amount: -10_000_000,
      });
      expect(result.summary.highestPoint).toEqual({
        month: "2026-05",
        amount: 5_000_000,
      });
    });

    it("누적 흐름이 음수가 된 적이 없으면 undefined다", () => {
      const result = generateCashFlowProjection({
        ...emptyInput,
        initialCash: 5_000_000,
        projectionMonths: 3,
      });

      expect(result.summary.breakEvenMonth).toBeUndefined();
    });

    it("initialCash가 음수였다가 첫 달에 회복되는 경우도 감지한다", () => {
      const result = generateCashFlowProjection({
        fundingSources: [
          {
            type: "예금",
            description: "예금 인출",
            amount: 10_000_000,
            expectedDate: new Date(2026, 2, 15),
          },
        ],
        setupCosts: [],
        initialCash: -5_000_000,
        projectionMonths: 2,
      });

      expect(result.projections[0].cumulativeCashFlow).toBe(5_000_000);
      expect(result.summary.breakEvenMonth).toBe("2026-03");
    });
  });
});
