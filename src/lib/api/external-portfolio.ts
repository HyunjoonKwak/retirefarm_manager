/**
 * External Portfolio API Client
 * nas_naver_crawler 서비스의 포트폴리오 데이터를 연동합니다.
 * 서비스 간 통신용 API Key 인증 사용
 */

const EXTERNAL_API_BASE_URL = process.env.EXTERNAL_PORTFOLIO_API_URL || "https://assets.specialrisk.me";
const SERVICE_API_KEY = process.env.EXTERNAL_PORTFOLIO_API_KEY || "retirefarm-service-key-2024";

export interface ExternalPortfolioAsset {
  id: string;
  propertyType: string;
  propertyName: string;
  address: string;
  roadAddress?: string;
  area?: number;
  pyeong?: number;
  purchaseDate?: string;
  purchasePrice: string; // BigInt as string
  currentPrice: string;
  totalAcquisitionCost?: string;
  loanAmount?: string;
  hasLoan: boolean;
  isRented?: boolean;
  monthlyRent?: string;
  deposit?: string;
  tradeType: "OWNED" | "FOR_SALE" | "SOLD";
  expectedSaleDate?: string;
  expectedSalePrice?: string;
  unrealizedGain: string;
  unrealizedGainRate: number;
  estimatedCapitalGainsTax?: string;
  estimatedNetProceeds?: string; // 실현가능수익금 (현재시세 - 대출금 - 보증금)
  memo?: string;
  tags?: string[];
}

export interface ExternalPortfolioSummary {
  totalAssets: number;
  totalValue: string;
  totalAcquisitionCost: string;
  totalLoanAmount: string;
  totalUnrealizedGain: string;
  averageYieldRate: number;
}

class ExternalPortfolioClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = EXTERNAL_API_BASE_URL;
  }

  /**
   * 서비스 간 통신용 API 호출
   * API Key 인증 사용
   */
  private async fetchService<T>(endpoint: string): Promise<T> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "x-service-api-key": SERVICE_API_KEY,
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`External API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * 특정 사용자의 자산 목록 조회 (서비스 API 사용)
   */
  async getAssetsByUserId(userId: string, tradeType?: string): Promise<ExternalPortfolioAsset[]> {
    const params = new URLSearchParams({ userId });
    if (tradeType) params.append("tradeType", tradeType);

    const result = await this.fetchService<{ data: { portfolios: ExternalPortfolioAsset[] } }>(
      `/api/portfolio/service?${params.toString()}`
    );

    return result.data?.portfolios || [];
  }

  /**
   * 보유 중인 자산 목록 조회
   */
  async getOwnedAssets(userId: string): Promise<ExternalPortfolioAsset[]> {
    return this.getAssetsByUserId(userId, "OWNED");
  }

  /**
   * 매물 등록된 자산 목록 조회
   */
  async getForSaleAssets(userId: string): Promise<ExternalPortfolioAsset[]> {
    return this.getAssetsByUserId(userId, "FOR_SALE");
  }

  /**
   * 매도 완료된 자산 목록 조회
   */
  async getSoldAssets(userId: string): Promise<ExternalPortfolioAsset[]> {
    return this.getAssetsByUserId(userId, "SOLD");
  }

  /**
   * 전체 자산 목록 조회
   */
  async getAllAssets(userId: string): Promise<ExternalPortfolioAsset[]> {
    return this.getAssetsByUserId(userId);
  }

  /**
   * 포트폴리오 요약 정보 계산
   */
  async getSummary(userId: string): Promise<ExternalPortfolioSummary> {
    const assets = await this.getOwnedAssets(userId);

    const summary: ExternalPortfolioSummary = {
      totalAssets: assets.length,
      totalValue: "0",
      totalAcquisitionCost: "0",
      totalLoanAmount: "0",
      totalUnrealizedGain: "0",
      averageYieldRate: 0,
    };

    if (assets.length === 0) return summary;

    let totalValue = BigInt(0);
    let totalAcquisitionCost = BigInt(0);
    let totalLoanAmount = BigInt(0);
    let totalUnrealizedGain = BigInt(0);
    let totalYieldRate = 0;

    for (const asset of assets) {
      totalValue += BigInt(asset.currentPrice || "0");
      totalAcquisitionCost += BigInt(asset.totalAcquisitionCost || asset.purchasePrice || "0");
      totalLoanAmount += BigInt(asset.loanAmount || "0");
      totalUnrealizedGain += BigInt(asset.unrealizedGain || "0");
      totalYieldRate += asset.unrealizedGainRate || 0;
    }

    return {
      totalAssets: assets.length,
      totalValue: totalValue.toString(),
      totalAcquisitionCost: totalAcquisitionCost.toString(),
      totalLoanAmount: totalLoanAmount.toString(),
      totalUnrealizedGain: totalUnrealizedGain.toString(),
      averageYieldRate: totalYieldRate / assets.length,
    };
  }

  /**
   * 매도 예정 자산의 예상 순수익 계산
   * 은퇴 자금 마련을 위한 자금 유입 예측에 사용
   */
  async getExpectedProceeds(userId: string): Promise<{
    assets: Array<{
      id: string;
      propertyName: string;
      expectedSaleDate: string;
      expectedSalePrice: string;
      estimatedTax: string;
      estimatedNetProceeds: string;
      loanPayoff: string;
    }>;
    totalExpectedProceeds: string;
  }> {
    const forSaleAssets = await this.getForSaleAssets(userId);

    const assets = forSaleAssets
      .filter(asset => asset.expectedSaleDate && asset.expectedSalePrice)
      .map(asset => {
        const expectedSalePrice = BigInt(asset.expectedSalePrice || "0");
        const estimatedTax = BigInt(asset.estimatedCapitalGainsTax || "0");
        const loanPayoff = BigInt(asset.loanAmount || "0");
        const estimatedNetProceeds = expectedSalePrice - estimatedTax - loanPayoff;

        return {
          id: asset.id,
          propertyName: asset.propertyName,
          expectedSaleDate: asset.expectedSaleDate!,
          expectedSalePrice: asset.expectedSalePrice!,
          estimatedTax: estimatedTax.toString(),
          estimatedNetProceeds: estimatedNetProceeds.toString(),
          loanPayoff: loanPayoff.toString(),
        };
      })
      .sort((a, b) => new Date(a.expectedSaleDate).getTime() - new Date(b.expectedSaleDate).getTime());

    const totalExpectedProceeds = assets.reduce(
      (sum, asset) => sum + BigInt(asset.estimatedNetProceeds),
      BigInt(0)
    );

    return {
      assets,
      totalExpectedProceeds: totalExpectedProceeds.toString(),
    };
  }
}

export const externalPortfolioClient = new ExternalPortfolioClient();
