import { describe, it, expect } from "vitest";
import {
  analyzeOptimalSaleOrder,
  previewAssetSale,
  findMinimumSalesForTarget,
  type SaleAsset,
} from "@/lib/calculators/sale-simulator";

function makeAsset(overrides: Partial<SaleAsset> = {}): SaleAsset {
  return {
    id: "asset-1",
    name: "테스트 토지",
    propertyType: "LAND",
    purchasePrice: 100_000_000,
    currentPrice: 150_000_000,
    acquisitionExpenses: 0,
    holdingPeriodYears: 3,
    isOnlyHouse: false,
    hasResided: false,
    ownershipShare: 100,
    ...overrides,
  };
}

// 사전 계산 값 (capital-gains-tax 로직 기준)
// landA: 매도가 150M, 수수료 750,000, 양도차익 49,250,000 → 세금 6,165,225, 순수익 43,084,775
const landA = makeAsset({ id: "land-a", name: "토지 A" });
const LAND_A_NET = 43_084_775;
const LAND_A_TAX = 6_165_225;
const LAND_A_GAIN = 49_250_000;

// landB: 매도가 220M, 수수료 880,000, 양도차익 19,120,000 → 세금 1,356,300, 순수익 17,763,700
const landB = makeAsset({
  id: "land-b",
  name: "토지 B",
  purchasePrice: 200_000_000,
  currentPrice: 220_000_000,
  holdingPeriodYears: 1,
});
const LAND_B_NET = 17_763_700;
const LAND_B_TAX = 1_356_300;
const LAND_B_GAIN = 19_120_000;

// lossLand: 매도가 250M < 취득가 300M → 손실, 세금 0
// 순수익 = 양도차익 (수수료 1,000,000 포함 차감) = -51,000,000
const lossLand = makeAsset({
  id: "land-loss",
  name: "손실 토지",
  purchasePrice: 300_000_000,
  currentPrice: 250_000_000,
  holdingPeriodYears: 5,
});
const LOSS_NET = -51_000_000;
const LOSS_GAIN = -51_000_000;

describe("previewAssetSale", () => {
  it("매도가 미지정 시 현재가 기준으로 세금과 순수익을 계산한다", () => {
    const asset = makeAsset({
      purchasePrice: 100_000_000,
      currentPrice: 300_000_000,
      acquisitionExpenses: 5_000_000,
      holdingPeriodYears: 4,
    });

    const result = previewAssetSale(asset);

    expect(result.salePrice).toBe(300_000_000);
    // 300M * 0.4% = 1,200,000
    expect(result.estimatedBrokerageFee).toBe(1_200_000);
    expect(result.taxResult.capitalGain).toBe(193_800_000);
    expect(result.taxResult.longTermDeductionRate).toBe(4);
    expect(result.taxResult.totalTax).toBe(54_789_064);
    expect(result.netProceeds).toBe(139_010_936);
    expect(result.netProceeds).toBe(result.taxResult.netProceeds);
  });

  it("매도가를 지정하면 해당 가격으로 계산한다", () => {
    const asset = makeAsset({ currentPrice: 300_000_000 });

    const result = previewAssetSale(asset, 200_000_000);

    expect(result.salePrice).toBe(200_000_000);
    expect(result.estimatedBrokerageFee).toBe(800_000);
  });

  it("원본 자산 필드를 유지하고 원본을 변경하지 않는다", () => {
    const asset = makeAsset({ id: "keep-id", name: "지분 자산" });
    const original = { ...asset };

    const result = previewAssetSale(asset);

    expect(result.id).toBe("keep-id");
    expect(result.name).toBe("지분 자산");
    expect(result.propertyType).toBe("LAND");
    expect(asset).toEqual(original);
  });

  it("손실 자산은 세금 0, 음수 순수익을 반환한다", () => {
    const result = previewAssetSale(lossLand);

    expect(result.taxResult.totalTax).toBe(0);
    expect(result.netProceeds).toBe(LOSS_NET);
  });
});

describe("analyzeOptimalSaleOrder", () => {
  it("빈 배열이면 0으로 채워진 결과를 반환한다", () => {
    const result = analyzeOptimalSaleOrder([]);

    expect(result.byNetProceeds.scenarios).toHaveLength(0);
    expect(result.byNetProceeds.totalNetProceeds).toBe(0);
    expect(result.byTaxEfficiency.totalTax).toBe(0);
    expect(result.byTaxRate.totalTaxRate).toBe(0);
    expect(result.comparison).toEqual({
      maxNetProceeds: 0,
      minNetProceeds: 0,
      difference: 0,
    });
  });

  it("단일 자산이면 시나리오 1개로 개별 매도 결과와 일치한다", () => {
    const result = analyzeOptimalSaleOrder([landA]);

    expect(result.byNetProceeds.scenarios).toHaveLength(1);
    expect(result.byNetProceeds.scenarios[0].order).toBe(1);
    expect(result.byNetProceeds.scenarios[0].asset.id).toBe("land-a");
    expect(result.byNetProceeds.totalNetProceeds).toBe(LAND_A_NET);
    expect(result.byNetProceeds.totalTax).toBe(LAND_A_TAX);
    expect(result.byNetProceeds.totalCapitalGain).toBe(LAND_A_GAIN);
    expect(result.byTaxEfficiency.totalNetProceeds).toBe(LAND_A_NET);
    expect(result.byTaxRate.totalNetProceeds).toBe(LAND_A_NET);
    expect(result.comparison.difference).toBe(0);
  });

  it("자산 2개의 합계와 누적 값을 정확히 계산한다", () => {
    const result = analyzeOptimalSaleOrder([landA, landB]);

    const best = result.byNetProceeds;
    expect(best.scenarios).toHaveLength(2);
    expect(best.totalNetProceeds).toBe(LAND_A_NET + LAND_B_NET);
    expect(best.totalTax).toBe(LAND_A_TAX + LAND_B_TAX);
    expect(best.totalCapitalGain).toBe(LAND_A_GAIN + LAND_B_GAIN);
    // 7,521,525 / 68,370,000 = 11.00%
    expect(best.totalTaxRate).toBe(11);

    // 누적 값은 마지막 시나리오에서 총합과 일치한다
    expect(best.scenarios[1].cumulativeNetProceeds).toBe(best.totalNetProceeds);
    expect(best.scenarios[1].cumulativeTax).toBe(best.totalTax);

    // 각 매도는 서로 독립 계산되므로 순서와 무관하게 총합이 같다
    expect(result.comparison.maxNetProceeds).toBe(LAND_A_NET + LAND_B_NET);
    expect(result.comparison.minNetProceeds).toBe(LAND_A_NET + LAND_B_NET);
    expect(result.comparison.difference).toBe(0);
  });

  it("손익 혼합 자산 3개의 세율과 총합을 계산한다", () => {
    const result = analyzeOptimalSaleOrder([landA, landB, lossLand]);

    const best = result.byNetProceeds;
    expect(best.scenarios).toHaveLength(3);
    expect(best.totalNetProceeds).toBe(LAND_A_NET + LAND_B_NET + LOSS_NET);
    expect(best.totalCapitalGain).toBe(LAND_A_GAIN + LAND_B_GAIN + LOSS_GAIN);
    // 7,521,525 / 17,370,000 = 43.3%
    expect(best.totalTaxRate).toBe(43.3);
  });

  it("손실 자산만 있으면 세율이 0으로 처리된다", () => {
    const result = analyzeOptimalSaleOrder([lossLand]);

    expect(result.byNetProceeds.totalNetProceeds).toBe(LOSS_NET);
    expect(result.byNetProceeds.totalCapitalGain).toBe(LOSS_GAIN);
    expect(result.byNetProceeds.totalTax).toBe(0);
    expect(result.byNetProceeds.totalTaxRate).toBe(0);
  });

  it("자산 7개(6개 초과)면 휴리스틱 경로로 계산한다", () => {
    const assets = Array.from({ length: 7 }, (_, i) =>
      makeAsset({
        id: `asset-${i + 1}`,
        purchasePrice: 200_000_000,
        currentPrice: 220_000_000,
        holdingPeriodYears: 1,
      })
    );
    const idsBefore = assets.map((a) => a.id);

    const result = analyzeOptimalSaleOrder(assets);

    expect(result.byNetProceeds.scenarios).toHaveLength(7);
    expect(result.byNetProceeds.totalNetProceeds).toBe(LAND_B_NET * 7);
    expect(result.comparison.difference).toBe(0);
    // 입력 배열은 변형되지 않는다 (휴리스틱 정렬은 복사본 사용)
    expect(assets.map((a) => a.id)).toEqual(idsBefore);
  });
});

describe("findMinimumSalesForTarget", () => {
  it("빈 배열이면 null을 반환한다", () => {
    expect(findMinimumSalesForTarget([], 100_000_000)).toBeNull();
  });

  it("순수익이 가장 높은 자산부터 선택한다", () => {
    // 입력 순서와 무관하게 landA(43M)가 landB(17M)보다 먼저 선택된다
    const result = findMinimumSalesForTarget([landB, landA], 40_000_000);

    expect(result).not.toBeNull();
    expect(result!.assets).toHaveLength(1);
    expect(result!.assets[0].id).toBe("land-a");
    expect(result!.totalNetProceeds).toBe(LAND_A_NET);
    expect(result!.shortfall).toBe(0);
  });

  it("목표 달성에 필요한 만큼만 자산을 선택한다", () => {
    const result = findMinimumSalesForTarget([landB, landA], 60_000_000);

    expect(result!.assets).toHaveLength(2);
    expect(result!.assets.map((a) => a.id)).toEqual(["land-a", "land-b"]);
    expect(result!.totalNetProceeds).toBe(LAND_A_NET + LAND_B_NET);
    expect(result!.shortfall).toBe(0);
  });

  it("목표에 미달하면 전체 자산 선택 후 부족분을 반환한다", () => {
    const result = findMinimumSalesForTarget([landA, landB], 100_000_000);

    expect(result!.assets).toHaveLength(2);
    expect(result!.totalNetProceeds).toBe(LAND_A_NET + LAND_B_NET);
    expect(result!.shortfall).toBe(100_000_000 - (LAND_A_NET + LAND_B_NET));
  });

  it("목표가 0이어도 최소 1개 자산이 선택된다", () => {
    // NOTE: 루프가 자산 선택 후 목표를 비교하므로 목표 0에도 첫 자산이 포함된다
    const result = findMinimumSalesForTarget([landA, landB], 0);

    expect(result!.assets).toHaveLength(1);
    expect(result!.assets[0].id).toBe("land-a");
    expect(result!.shortfall).toBe(0);
  });

  it("손실 자산만으로 목표 미달 시 음수 순수익과 부족분을 반환한다", () => {
    const result = findMinimumSalesForTarget([lossLand], 10_000_000);

    expect(result!.assets).toHaveLength(1);
    expect(result!.totalNetProceeds).toBe(LOSS_NET);
    expect(result!.shortfall).toBe(61_000_000);
  });
});
