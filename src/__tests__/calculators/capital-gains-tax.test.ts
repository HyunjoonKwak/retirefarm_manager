import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateCapitalGainsTax,
  estimateBrokerageFee,
  calculateHoldingPeriodYears,
  type CapitalGainsTaxInput,
} from "@/lib/calculators/capital-gains-tax";

describe("calculateCapitalGainsTax", () => {
  describe("양도차손 (손실) 케이스", () => {
    it("손실이면 모든 세금이 0이다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 400_000_000,
        purchasePrice: 500_000_000,
        acquisitionExpenses: 10_000_000,
        holdingPeriodYears: 5,
        propertyType: "COMMERCIAL",
      });

      expect(result.capitalGain).toBe(-110_000_000);
      expect(result.longTermDeduction).toBe(0);
      expect(result.taxableIncome).toBe(0);
      expect(result.taxRate).toBe(0);
      expect(result.capitalGainsTax).toBe(0);
      expect(result.localIncomeTax).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.effectiveTaxRate).toBe(0);
      // 정상 분기와 동일하게 필요경비까지 차감한 순수익을 반환한다
      expect(result.netProceeds).toBe(-110_000_000);
    });

    it("양도차익이 정확히 0이면 손실 분기로 처리된다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 500_000_000,
        purchasePrice: 490_000_000,
        acquisitionExpenses: 10_000_000,
        holdingPeriodYears: 3,
        propertyType: "COMMERCIAL",
      });

      expect(result.capitalGain).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.netProceeds).toBe(0);
    });
  });

  describe("1세대 1주택 비과세", () => {
    const exemptBase: CapitalGainsTaxInput = {
      salePrice: 900_000_000,
      purchasePrice: 500_000_000,
      acquisitionExpenses: 20_000_000,
      holdingPeriodYears: 5,
      propertyType: "HOUSE",
      isOnlyHouse: true,
      hasResided: true,
    };

    it("12억 이하 매도 시 전액 비과세된다", () => {
      const result = calculateCapitalGainsTax(exemptBase);

      expect(result.capitalGain).toBe(380_000_000);
      expect(result.totalTax).toBe(0);
      expect(result.taxableIncome).toBe(0);
      expect(result.netProceeds).toBe(380_000_000);
    });

    it("매도가가 정확히 12억이면 비과세된다", () => {
      const result = calculateCapitalGainsTax({
        ...exemptBase,
        salePrice: 1_200_000_000,
      });

      expect(result.totalTax).toBe(0);
      expect(result.netProceeds).toBe(result.capitalGain);
    });

    it("보유 2년(경계값)이면 비과세된다", () => {
      const result = calculateCapitalGainsTax({
        ...exemptBase,
        holdingPeriodYears: 2,
      });

      expect(result.totalTax).toBe(0);
    });

    it("보유 1년이면 비과세가 적용되지 않는다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 600_000_000,
        purchasePrice: 400_000_000,
        acquisitionExpenses: 0,
        holdingPeriodYears: 1,
        propertyType: "HOUSE",
        isOnlyHouse: true,
        hasResided: true,
      });

      expect(result.capitalGain).toBe(200_000_000);
      expect(result.longTermDeductionRate).toBe(0);
      expect(result.taxableIncome).toBe(197_500_000);
      expect(result.taxRate).toBe(38);
      expect(result.capitalGainsTax).toBe(55_110_000);
      expect(result.totalTax).toBe(60_621_000);
    });

    it("주거용 오피스텔도 주택으로 취급되어 비과세된다", () => {
      const result = calculateCapitalGainsTax({
        ...exemptBase,
        propertyType: "OFFICETEL_RESIDENTIAL",
        holdingPeriodYears: 3,
        salePrice: 1_000_000_000,
      });

      expect(result.totalTax).toBe(0);
    });

    it("propertyType 미지정 시 HOUSE로 기본 처리되어 비과세된다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 800_000_000,
        purchasePrice: 500_000_000,
        acquisitionExpenses: 0,
        holdingPeriodYears: 3,
        isOnlyHouse: true,
        hasResided: true,
      });

      expect(result.totalTax).toBe(0);
      expect(result.netProceeds).toBe(300_000_000);
    });

    it("상가는 1주택 조건이어도 비과세가 적용되지 않는다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 800_000_000,
        purchasePrice: 400_000_000,
        acquisitionExpenses: 0,
        holdingPeriodYears: 5,
        propertyType: "COMMERCIAL",
        isOnlyHouse: true,
        hasResided: true,
      });

      expect(result.totalTax).toBeGreaterThan(0);
      // 상가/토지 공제율 분기가 우선 적용된다
      expect(result.longTermDeductionRate).toBe(6);
    });

    it("거주 요건 미충족 시 비과세가 적용되지 않는다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 900_000_000,
        purchasePrice: 500_000_000,
        acquisitionExpenses: 0,
        holdingPeriodYears: 5,
        propertyType: "HOUSE",
        isOnlyHouse: true,
        hasResided: false,
      });

      expect(result.totalTax).toBeGreaterThan(0);
      // 비거주 시 일반 공제율 (연 3%)
      expect(result.longTermDeductionRate).toBe(9);
    });

    it("12억 초과분만 과세된다 (보유 12년, 80% 장특공제)", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 1_500_000_000,
        purchasePrice: 800_000_000,
        acquisitionExpenses: 0,
        holdingPeriodYears: 12,
        propertyType: "HOUSE",
        isOnlyHouse: true,
        hasResided: true,
      });

      // 과세대상 양도차익 = 700M * (300M / 1500M) = 140M
      expect(result.capitalGain).toBe(700_000_000);
      expect(result.longTermDeductionRate).toBe(80);
      expect(result.longTermDeduction).toBe(112_000_000);
      expect(result.taxableIncome).toBe(25_500_000);
      expect(result.taxRate).toBe(15);
      expect(result.capitalGainsTax).toBe(2_565_000);
      expect(result.localIncomeTax).toBe(256_500);
      expect(result.totalTax).toBe(2_821_500);
      expect(result.effectiveTaxRate).toBe(0.4);
      expect(result.netProceeds).toBe(697_178_500);
    });

    it("12억 초과 + 보유 5년이면 장특공제 24%가 적용된다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 1_500_000_000,
        purchasePrice: 800_000_000,
        acquisitionExpenses: 0,
        holdingPeriodYears: 5,
        propertyType: "HOUSE",
        isOnlyHouse: true,
        hasResided: true,
      });

      expect(result.longTermDeductionRate).toBe(24);
      expect(result.longTermDeduction).toBe(33_600_000);
      expect(result.taxableIncome).toBe(103_900_000);
      expect(result.taxRate).toBe(35);
      expect(result.totalTax).toBe(23_017_500);
    });
  });

  describe("장기보유특별공제율", () => {
    const commercialBase: CapitalGainsTaxInput = {
      salePrice: 400_000_000,
      purchasePrice: 200_000_000,
      acquisitionExpenses: 0,
      holdingPeriodYears: 0,
      propertyType: "COMMERCIAL",
    };

    it.each([
      [2, 0],
      [3, 2],
      [10, 16],
      [14, 24],
      [15, 30],
      [25, 30],
    ])("상가/토지 보유 %i년 → %i%%", (years, expectedRate) => {
      const result = calculateCapitalGainsTax({
        ...commercialBase,
        holdingPeriodYears: years,
      });
      expect(result.longTermDeductionRate).toBe(expectedRate);
    });

    it("토지도 상가와 동일한 공제율이 적용된다", () => {
      const result = calculateCapitalGainsTax({
        ...commercialBase,
        propertyType: "LAND",
        holdingPeriodYears: 15,
      });
      expect(result.longTermDeductionRate).toBe(30);
    });

    it.each([
      [2, 0],
      [3, 3],
      [5, 9],
      [9, 21],
      [10, 30],
      [20, 30],
    ])("다주택 주택 보유 %i년 → %i%%", (years, expectedRate) => {
      const result = calculateCapitalGainsTax({
        ...commercialBase,
        propertyType: "HOUSE",
        isOnlyHouse: false,
        hasResided: false,
        holdingPeriodYears: years,
      });
      expect(result.longTermDeductionRate).toBe(expectedRate);
    });
  });

  describe("기본공제 (250만원) 경계", () => {
    const smallGainBase: CapitalGainsTaxInput = {
      salePrice: 0,
      purchasePrice: 100_000_000,
      acquisitionExpenses: 0,
      holdingPeriodYears: 1,
      propertyType: "COMMERCIAL",
    };

    it("양도차익이 기본공제 이하이면 세금이 0이다", () => {
      const result = calculateCapitalGainsTax({
        ...smallGainBase,
        salePrice: 102_000_000,
      });

      expect(result.capitalGain).toBe(2_000_000);
      expect(result.basicDeduction).toBe(2_500_000);
      expect(result.taxableIncome).toBe(0);
      expect(result.taxRate).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.netProceeds).toBe(2_000_000);
    });

    it("양도차익이 정확히 250만원이면 과세표준이 0이다", () => {
      const result = calculateCapitalGainsTax({
        ...smallGainBase,
        salePrice: 102_500_000,
      });

      expect(result.taxableIncome).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.netProceeds).toBe(2_500_000);
    });

    it("양도차익이 250만원 + 1원이면 과세표준 1원으로 과세 분기에 진입한다", () => {
      const result = calculateCapitalGainsTax({
        ...smallGainBase,
        salePrice: 102_500_001,
      });

      expect(result.taxableIncome).toBe(1);
      expect(result.taxRate).toBe(6);
      // floor(1 * 0.06) = 0
      expect(result.capitalGainsTax).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.netProceeds).toBe(2_500_001);
    });
  });

  describe("누진세율 구간", () => {
    // COMMERCIAL + 보유 1년 → 장특공제 0, 과세표준 = 양도차익 - 250만원
    const makeInput = (taxableIncome: number): CapitalGainsTaxInput => ({
      salePrice: taxableIncome + 2_500_000,
      purchasePrice: 0,
      acquisitionExpenses: 0,
      holdingPeriodYears: 1,
      propertyType: "COMMERCIAL",
    });

    it.each([
      [14_000_000, 6, 840_000],
      [14_000_001, 15, 840_000],
      [50_000_000, 15, 6_240_000],
      [50_000_001, 24, 6_240_000],
      [88_000_000, 24, 15_360_000],
      [150_000_000, 35, 37_060_000],
      [300_000_000, 38, 94_060_000],
      [500_000_000, 40, 174_060_000],
      [1_000_000_000, 42, 384_060_000],
      [2_000_000_000, 45, 834_060_000],
    ])("과세표준 %i원 → 세율 %i%%, 세액 %i원", (taxableIncome, expectedRate, expectedTax) => {
      const result = calculateCapitalGainsTax(makeInput(taxableIncome));

      expect(result.taxableIncome).toBe(taxableIncome);
      expect(result.taxRate).toBe(expectedRate);
      expect(result.capitalGainsTax).toBe(expectedTax);
      expect(result.localIncomeTax).toBe(Math.floor(expectedTax * 0.1));
      expect(result.totalTax).toBe(expectedTax + Math.floor(expectedTax * 0.1));
    });
  });

  describe("정상 케이스 종합 검증", () => {
    it("상가 5년 보유 매도 시 전체 필드를 정확히 계산한다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 500_000_000,
        purchasePrice: 300_000_000,
        acquisitionExpenses: 10_000_000,
        transferExpenses: 5_000_000,
        holdingPeriodYears: 5,
        propertyType: "COMMERCIAL",
      });

      expect(result.purchasePrice).toBe(300_000_000);
      expect(result.salePrice).toBe(500_000_000);
      expect(result.acquisitionExpenses).toBe(10_000_000);
      expect(result.transferExpenses).toBe(5_000_000);
      expect(result.capitalGain).toBe(185_000_000);
      expect(result.longTermDeductionRate).toBe(6);
      expect(result.longTermDeduction).toBe(11_100_000);
      expect(result.basicDeduction).toBe(2_500_000);
      expect(result.taxableIncome).toBe(171_400_000);
      expect(result.taxRate).toBe(38);
      expect(result.capitalGainsTax).toBe(45_192_000);
      expect(result.localIncomeTax).toBe(4_519_200);
      expect(result.totalTax).toBe(49_711_200);
      expect(result.effectiveTaxRate).toBe(26.87);
      expect(result.netProceeds).toBe(135_288_800);
    });

    it("transferExpenses 미지정 시 0으로 처리된다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 103_000_000,
        purchasePrice: 100_000_000,
        acquisitionExpenses: 500_000,
        holdingPeriodYears: 1,
        propertyType: "COMMERCIAL",
      });

      expect(result.transferExpenses).toBe(0);
      expect(result.capitalGain).toBe(2_500_000);
    });
  });

  describe("지분율 적용", () => {
    it("지분율 50%면 모든 금액이 절반으로 조정된다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 1_000_000_000,
        purchasePrice: 600_000_000,
        acquisitionExpenses: 20_000_000,
        transferExpenses: 10_000_000,
        holdingPeriodYears: 5,
        propertyType: "COMMERCIAL",
        ownershipShare: 50,
      });

      expect(result.purchasePrice).toBe(300_000_000);
      expect(result.salePrice).toBe(500_000_000);
      expect(result.acquisitionExpenses).toBe(10_000_000);
      expect(result.transferExpenses).toBe(5_000_000);
      expect(result.capitalGain).toBe(185_000_000);
      expect(result.totalTax).toBe(49_711_200);
    });

    it("지분율 적용 시 소수점은 내림 처리된다", () => {
      const result = calculateCapitalGainsTax({
        salePrice: 201,
        purchasePrice: 101,
        acquisitionExpenses: 0,
        holdingPeriodYears: 1,
        propertyType: "COMMERCIAL",
        ownershipShare: 50,
      });

      // floor(201 * 0.5) = 100, floor(101 * 0.5) = 50
      expect(result.salePrice).toBe(100);
      expect(result.purchasePrice).toBe(50);
      expect(result.capitalGain).toBe(50);
    });
  });
});

describe("estimateBrokerageFee", () => {
  it.each([
    [0, 0],
    [30_000_000, 180_000],
    [45_000_000, 250_000], // 0.6% = 270,000 → 상한 250,000
    [49_999_999, 250_000],
    [50_000_000, 250_000], // 0.5% 구간 진입
    [100_000_000, 500_000],
    [180_000_000, 800_000], // 0.5% = 900,000 → 상한 800,000
    [199_999_999, 800_000],
    [200_000_000, 800_000], // 0.4% 구간 (상한 없음)
    [500_000_000, 2_000_000],
    [899_999_999, 3_599_999], // floor 처리 확인
    [900_000_000, 3_600_000],
    [1_500_000_000, 6_000_000],
  ])("매도가 %i원 → 수수료 %i원", (salePrice, expectedFee) => {
    expect(estimateBrokerageFee(salePrice)).toBe(expectedFee);
  });
});

describe("calculateHoldingPeriodYears", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("6년 전 매수 날짜 문자열이면 6을 반환한다", () => {
    expect(calculateHoldingPeriodYears("2020-01-15")).toBe(6);
  });

  it("Date 객체 입력도 처리한다", () => {
    expect(calculateHoldingPeriodYears(new Date("2024-01-15T00:00:00Z"))).toBe(2);
  });

  it("1년 미만 보유는 0을 반환한다", () => {
    expect(calculateHoldingPeriodYears("2025-01-16")).toBe(0);
  });

  it("미래 날짜는 0으로 방어 처리된다", () => {
    expect(calculateHoldingPeriodYears("2026-06-15")).toBe(0);
  });
});
