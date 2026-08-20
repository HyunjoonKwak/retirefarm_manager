/**
 * asset_manager 매도 시뮬레이션 프록시 클라이언트 (Asset Hub Integration §1.5.3)
 *
 * 양도소득세·매도 시뮬 계산의 소유자는 asset_manager다. retirefarm은
 * POST /api/simulations/sale을 호출만 한다 — 계산 로직을 여기 두지 않는다.
 * 취득가·경비·보유기간·지분율·임대사업자 정보는 asset_manager가 자기
 * 원장(Portfolio)에서 자동으로 가져온다.
 *
 * 인증: 스냅샷 서비스 토큰 재사용 (§2.1과 동일 토큰, 읽기 전용 계산).
 */

export interface SaleSimulationRequest {
  portfolioIds?: string[]; // 미지정 시 보유 전체
  targetAmount?: string; // 목표 금액 (원, 정수 문자열)
  salePriceOverrides?: Record<string, string>; // 물건별 매도 희망가
  assumptions?: {
    isOnlyHouse?: boolean;
    hasResided?: boolean;
  };
}

// asset_manager 응답의 BigInt는 문자열로 직렬화되어 온다
export interface SaleTaxResult {
  purchasePrice: string;
  salePrice: string;
  acquisitionExpenses: string;
  transferExpenses: string;
  capitalGain: string;
  longTermDeduction: string;
  longTermDeductionRate: number;
  rentalDeduction: string;
  rentalDeductionRate: number;
  basicDeduction: string;
  taxableIncome: string;
  taxRate: number;
  capitalGainsTax: string;
  localIncomeTax: string;
  totalTax: string;
  effectiveTaxRate: number;
}

export interface SaleScenarioAsset {
  id: string;
  name: string;
  propertyType: string;
  purchasePrice: string;
  currentPrice: string;
  holdingPeriodYears: number;
  ownershipShare: number;
  salePrice: string;
  taxResult: SaleTaxResult;
  estimatedBrokerageFee: string;
  netProceeds: string;
}

export interface SaleScenario {
  order: number;
  asset: SaleScenarioAsset;
  cumulativeNetProceeds: string;
  cumulativeTax: string;
}

export interface SaleSimulationResult {
  scenarios: SaleScenario[];
  totalNetProceeds: string;
  totalTax: string;
  totalTaxRate: number;
  totalCapitalGain: string;
}

export interface SaleSimulationResponse {
  assumptions: { isOnlyHouse: boolean; hasResided: boolean; assetCount: number };
  preview: SaleScenarioAsset[];
  optimalOrder: {
    byNetProceeds: SaleSimulationResult;
    byTaxEfficiency: SaleSimulationResult;
    byTaxRate: SaleSimulationResult;
    comparison: {
      maxNetProceeds: string;
      minNetProceeds: string;
      difference: string;
    };
  };
  // shortfall = 목표 - 달성액 (음수면 초과 달성)
  minimumSalesForTarget: {
    assets: SaleScenarioAsset[];
    totalNetProceeds: string;
    shortfall: string;
  } | null;
}

const FETCH_TIMEOUT_MS = 15_000;

export async function runSaleSimulation(
  request: SaleSimulationRequest
): Promise<SaleSimulationResponse> {
  const baseUrl = (
    process.env.ASSET_MANAGER_URL ||
    process.env.EXTERNAL_PORTFOLIO_API_URL ||
    ""
  ).replace(/\/$/, "");
  const token = process.env.ASSET_MANAGER_SNAPSHOT_TOKEN;

  if (!baseUrl || !token) {
    throw new Error(
      "ASSET_MANAGER_URL / ASSET_MANAGER_SNAPSHOT_TOKEN 환경변수가 설정되지 않았습니다."
    );
  }

  const response = await fetch(`${baseUrl}/api/simulations/sale`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.success) {
    const message =
      body?.error?.message || body?.message || `HTTP ${response.status}`;
    throw new Error(`asset_manager 매도 시뮬레이션 실패: ${message}`);
  }

  return body.data as SaleSimulationResponse;
}
