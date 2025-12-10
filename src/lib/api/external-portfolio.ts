/**
 * External Portfolio API Client
 * nas_naver_crawler 서비스의 포트폴리오 데이터를 연동합니다.
 */

const EXTERNAL_API_BASE_URL = process.env.EXTERNAL_PORTFOLIO_API_URL || "https://assets.specialrisk.me";

export interface ExternalPortfolioAsset {
  id: string;
  propertyType: string;
  propertyName: string;
  address: string;
  roadAddress?: string;
  area: number;
  pyeong: number;
  purchaseDate: string;
  purchasePrice: string; // BigInt as string
  currentPrice: string;
  totalAcquisitionCost: string;
  loanAmount?: string;
  hasLoan: boolean;
  isRented: boolean;
  monthlyRent?: string;
  deposit?: string;
  tradeType: "OWNED" | "FOR_SALE" | "SOLD";
  expectedSaleDate?: string;
  expectedSalePrice?: string;
  unrealizedGain: string;
  unrealizedGainRate: number;
  estimatedCapitalGainsTax?: string;
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
  private apiKey?: string;

  constructor() {
    this.baseUrl = EXTERNAL_API_BASE_URL;
    this.apiKey = process.env.EXTERNAL_PORTFOLIO_API_KEY;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      ...options?.headers,
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`External API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 보유 중인 자산 목록 조회
   */
  async getOwnedAssets(): Promise<ExternalPortfolioAsset[]> {
    return this.fetch<ExternalPortfolioAsset[]>("/portfolio?tradeType=OWNED");
  }

  /**
   * 매물 등록된 자산 목록 조회
   */
  async getForSaleAssets(): Promise<ExternalPortfolioAsset[]> {
    return this.fetch<ExternalPortfolioAsset[]>("/portfolio?tradeType=FOR_SALE");
  }

  /**
   * 매도 완료된 자산 목록 조회
   */
  async getSoldAssets(): Promise<ExternalPortfolioAsset[]> {
    return this.fetch<ExternalPortfolioAsset[]>("/portfolio?tradeType=SOLD");
  }

  /**
   * 전체 자산 목록 조회
   */
  async getAllAssets(): Promise<ExternalPortfolioAsset[]> {
    return this.fetch<ExternalPortfolioAsset[]>("/portfolio");
  }

  /**
   * 개별 자산 상세 조회
   */
  async getAssetById(id: string): Promise<ExternalPortfolioAsset> {
    return this.fetch<ExternalPortfolioAsset>(`/portfolio/${id}`);
  }

  /**
   * 포트폴리오 요약 정보 계산
   */
  async getSummary(): Promise<ExternalPortfolioSummary> {
    const assets = await this.getOwnedAssets();

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
      totalAcquisitionCost += BigInt(asset.totalAcquisitionCost || "0");
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
  async getExpectedProceeds(): Promise<{
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
    const forSaleAssets = await this.getForSaleAssets();

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
