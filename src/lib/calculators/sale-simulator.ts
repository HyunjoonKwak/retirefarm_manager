/**
 * 매도 시뮬레이터
 * 최적의 매도 순서 및 타이밍 분석
 */

import {
  calculateCapitalGainsTax,
  estimateBrokerageFee,
  type CapitalGainsTaxInput,
  type CapitalGainsTaxResult,
  type PropertyType,
} from "./capital-gains-tax";

export interface SaleAsset {
  id: string;
  name: string;
  propertyType: PropertyType;
  purchasePrice: number;
  currentPrice: number;
  acquisitionExpenses: number;
  holdingPeriodYears: number;
  isOnlyHouse: boolean;
  hasResided: boolean;
  ownershipShare: number;
}

export interface SaleScenarioAsset extends SaleAsset {
  salePrice: number;
  taxResult: CapitalGainsTaxResult;
  estimatedBrokerageFee: number;
  netProceeds: number;
}

export interface SaleScenario {
  order: number;
  asset: SaleScenarioAsset;
  cumulativeNetProceeds: number;
  cumulativeTax: number;
}

export interface SaleSimulationResult {
  scenarios: SaleScenario[];
  totalNetProceeds: number;
  totalTax: number;
  totalTaxRate: number;
  totalCapitalGain: number;
}

export interface OptimalSaleOrderResult {
  byNetProceeds: SaleSimulationResult;
  byTaxEfficiency: SaleSimulationResult;
  byTaxRate: SaleSimulationResult;
  comparison: {
    maxNetProceeds: number;
    minNetProceeds: number;
    difference: number;
  };
}

/**
 * 자산별 매도 결과 계산
 */
function calculateAssetSaleResult(
  asset: SaleAsset,
  salePrice?: number
): SaleScenarioAsset {
  const actualSalePrice = salePrice ?? asset.currentPrice;
  const brokerageFee = estimateBrokerageFee(actualSalePrice);

  const taxInput: CapitalGainsTaxInput = {
    salePrice: actualSalePrice,
    purchasePrice: asset.purchasePrice,
    acquisitionExpenses: asset.acquisitionExpenses,
    transferExpenses: brokerageFee,
    holdingPeriodYears: asset.holdingPeriodYears,
    propertyType: asset.propertyType,
    isOnlyHouse: asset.isOnlyHouse,
    hasResided: asset.hasResided,
    ownershipShare: asset.ownershipShare,
  };

  const taxResult = calculateCapitalGainsTax(taxInput);

  return {
    ...asset,
    salePrice: actualSalePrice,
    taxResult,
    estimatedBrokerageFee: brokerageFee,
    netProceeds: taxResult.netProceeds,
  };
}

/**
 * 특정 순서로 매도했을 때의 시뮬레이션
 */
function simulateSaleOrder(
  assets: SaleAsset[],
  order: string[]
): SaleSimulationResult {
  const scenarios: SaleScenario[] = [];
  let cumulativeNetProceeds = 0;
  let cumulativeTax = 0;
  let totalCapitalGain = 0;

  for (let i = 0; i < order.length; i++) {
    const assetId = order[i];
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) continue;

    const saleResult = calculateAssetSaleResult(asset);
    cumulativeNetProceeds += saleResult.netProceeds;
    cumulativeTax += saleResult.taxResult.totalTax;
    totalCapitalGain += saleResult.taxResult.capitalGain;

    scenarios.push({
      order: i + 1,
      asset: saleResult,
      cumulativeNetProceeds,
      cumulativeTax,
    });
  }

  return {
    scenarios,
    totalNetProceeds: cumulativeNetProceeds,
    totalTax: cumulativeTax,
    totalTaxRate: totalCapitalGain > 0
      ? Math.round((cumulativeTax / totalCapitalGain) * 10000) / 100
      : 0,
    totalCapitalGain,
  };
}

/**
 * 순열 생성 (최대 6개 자산까지만 지원)
 */
function generatePermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  if (arr.length > 6) {
    // 6개 초과 시 휴리스틱 기반 순서만 반환
    return [arr];
  }

  const result: T[][] = [];

  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const remainingPerms = generatePermutations(remaining);

    for (const perm of remainingPerms) {
      result.push([current, ...perm]);
    }
  }

  return result;
}

/**
 * 최적 매도 순서 분석
 */
export function analyzeOptimalSaleOrder(
  assets: SaleAsset[]
): OptimalSaleOrderResult {
  if (assets.length === 0) {
    const emptyResult: SaleSimulationResult = {
      scenarios: [],
      totalNetProceeds: 0,
      totalTax: 0,
      totalTaxRate: 0,
      totalCapitalGain: 0,
    };
    return {
      byNetProceeds: emptyResult,
      byTaxEfficiency: emptyResult,
      byTaxRate: emptyResult,
      comparison: {
        maxNetProceeds: 0,
        minNetProceeds: 0,
        difference: 0,
      },
    };
  }

  const assetIds = assets.map((a) => a.id);

  // 자산이 6개 이하면 모든 순열 계산, 초과면 휴리스틱 사용
  let allResults: SaleSimulationResult[];

  if (assets.length <= 6) {
    const permutations = generatePermutations(assetIds);
    allResults = permutations.map((order) => simulateSaleOrder(assets, order));
  } else {
    // 휴리스틱 기반 순서 생성
    const heuristicOrders: string[][] = [
      // 1. 현재 순서
      assetIds,
      // 2. 양도차익 낮은 순
      [...assets].sort((a, b) =>
        (a.currentPrice - a.purchasePrice) - (b.currentPrice - b.purchasePrice)
      ).map((a) => a.id),
      // 3. 양도차익 높은 순
      [...assets].sort((a, b) =>
        (b.currentPrice - b.purchasePrice) - (a.currentPrice - a.purchasePrice)
      ).map((a) => a.id),
      // 4. 보유기간 긴 순
      [...assets].sort((a, b) => b.holdingPeriodYears - a.holdingPeriodYears).map((a) => a.id),
      // 5. 보유기간 짧은 순
      [...assets].sort((a, b) => a.holdingPeriodYears - b.holdingPeriodYears).map((a) => a.id),
      // 6. 가격 낮은 순
      [...assets].sort((a, b) => a.currentPrice - b.currentPrice).map((a) => a.id),
      // 7. 가격 높은 순
      [...assets].sort((a, b) => b.currentPrice - a.currentPrice).map((a) => a.id),
    ];

    allResults = heuristicOrders.map((order) => simulateSaleOrder(assets, order));
  }

  // 최적 결과 찾기
  const byNetProceeds = allResults.reduce((best, current) =>
    current.totalNetProceeds > best.totalNetProceeds ? current : best
  );

  const byTaxEfficiency = allResults.reduce((best, current) =>
    current.totalTax < best.totalTax ? current : best
  );

  const byTaxRate = allResults.reduce((best, current) =>
    current.totalTaxRate < best.totalTaxRate ? current : best
  );

  const netProceedsValues = allResults.map((r) => r.totalNetProceeds);
  const maxNetProceeds = Math.max(...netProceedsValues);
  const minNetProceeds = Math.min(...netProceedsValues);

  return {
    byNetProceeds,
    byTaxEfficiency,
    byTaxRate,
    comparison: {
      maxNetProceeds,
      minNetProceeds,
      difference: maxNetProceeds - minNetProceeds,
    },
  };
}

/**
 * 개별 자산 매도 결과 미리보기
 */
export function previewAssetSale(asset: SaleAsset, salePrice?: number): SaleScenarioAsset {
  return calculateAssetSaleResult(asset, salePrice);
}

/**
 * 목표 금액 달성을 위한 최소 매도 자산 찾기
 */
export function findMinimumSalesForTarget(
  assets: SaleAsset[],
  targetAmount: number
): { assets: SaleScenarioAsset[]; totalNetProceeds: number; shortfall: number } | null {
  if (assets.length === 0) return null;

  // 순수익 높은 순으로 정렬
  const sortedAssets = [...assets]
    .map((a) => calculateAssetSaleResult(a))
    .sort((a, b) => b.netProceeds - a.netProceeds);

  const selectedAssets: SaleScenarioAsset[] = [];
  let totalNetProceeds = 0;

  for (const asset of sortedAssets) {
    selectedAssets.push(asset);
    totalNetProceeds += asset.netProceeds;

    if (totalNetProceeds >= targetAmount) {
      break;
    }
  }

  return {
    assets: selectedAssets,
    totalNetProceeds,
    shortfall: Math.max(0, targetAmount - totalNetProceeds),
  };
}
