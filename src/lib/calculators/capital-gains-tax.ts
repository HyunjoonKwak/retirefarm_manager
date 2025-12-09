/**
 * 양도소득세 계산 라이브러리
 * nas_naver_crawler의 portfolio-calculator.ts를 참조하여 구현
 */

export type PropertyType = "HOUSE" | "COMMERCIAL" | "LAND" | "OFFICETEL_RESIDENTIAL";

export interface CapitalGainsTaxInput {
  salePrice: number;           // 매도가
  purchasePrice: number;       // 취득가
  acquisitionExpenses: number; // 취득 시 필요경비 (취득세, 중개수수료 등)
  transferExpenses?: number;   // 양도 시 필요경비 (중개수수료 등)
  holdingPeriodYears: number;  // 보유기간 (년)
  propertyType?: PropertyType; // 부동산 유형 (기본: HOUSE)
  isOnlyHouse?: boolean;       // 1주택 여부 (기본: false)
  hasResided?: boolean;        // 2년 이상 거주 여부 (기본: false)
  ownershipShare?: number;     // 본인 지분율 (%, 기본: 100)
}

export interface CapitalGainsTaxResult {
  // 기본 정보
  purchasePrice: number;
  salePrice: number;
  acquisitionExpenses: number;
  transferExpenses: number;

  // 계산 결과
  capitalGain: number;              // 양도차익
  longTermDeduction: number;        // 장기보유특별공제
  longTermDeductionRate: number;    // 장기보유특별공제율 (%)
  basicDeduction: number;           // 기본공제 (250만원)
  taxableIncome: number;            // 과세표준

  // 세액
  taxRate: number;                  // 적용 세율 (%)
  capitalGainsTax: number;          // 양도소득세 (지방세 제외)
  localIncomeTax: number;           // 지방소득세 (10%)
  totalTax: number;                 // 총 납부세액
  effectiveTaxRate: number;         // 실효세율 (%)

  // 순수익
  netProceeds: number;              // 세후 순수익
}

/**
 * 장기보유특별공제율 계산
 */
function calculateLongTermDeductionRate(
  holdingPeriodYears: number,
  propertyType: PropertyType,
  isOnlyHouse: boolean,
  hasResided: boolean
): number {
  const isHouseType = propertyType === "HOUSE" || propertyType === "OFFICETEL_RESIDENTIAL";
  const isCommercialOrLand = propertyType === "COMMERCIAL" || propertyType === "LAND";

  if (isCommercialOrLand) {
    // 상가/토지: 3년 이상 보유 시 연 2%, 최대 30% (15년)
    if (holdingPeriodYears >= 15) return 30;
    if (holdingPeriodYears >= 3) return (holdingPeriodYears - 2) * 2;
    return 0;
  }

  if (isHouseType && isOnlyHouse && hasResided) {
    // 1주택 + 2년 이상 거주: 고율 공제 (최대 80%)
    if (holdingPeriodYears >= 10) return 80;
    if (holdingPeriodYears >= 3) return (holdingPeriodYears - 2) * 8;
    return 0;
  }

  // 다주택자 또는 비거주: 연 3%씩, 최대 30% (10년)
  if (holdingPeriodYears >= 10) return 30;
  if (holdingPeriodYears >= 3) return (holdingPeriodYears - 2) * 3;
  return 0;
}

/**
 * 양도소득세 계산
 */
export function calculateCapitalGainsTax(input: CapitalGainsTaxInput): CapitalGainsTaxResult {
  const {
    salePrice,
    purchasePrice,
    acquisitionExpenses,
    transferExpenses = 0,
    holdingPeriodYears,
    propertyType = "HOUSE",
    isOnlyHouse = false,
    hasResided = false,
    ownershipShare = 100,
  } = input;

  const isHouseType = propertyType === "HOUSE" || propertyType === "OFFICETEL_RESIDENTIAL";

  // 지분율 적용
  const shareRatio = ownershipShare / 100;
  const adjustedPurchasePrice = Math.floor(purchasePrice * shareRatio);
  const adjustedSalePrice = Math.floor(salePrice * shareRatio);
  const adjustedAcquisitionExpenses = Math.floor(acquisitionExpenses * shareRatio);
  const adjustedTransferExpenses = Math.floor(transferExpenses * shareRatio);

  // 양도차익 계산
  const capitalGain = adjustedSalePrice - adjustedPurchasePrice - adjustedAcquisitionExpenses - adjustedTransferExpenses;

  // 손실인 경우
  if (capitalGain <= 0) {
    return {
      purchasePrice: adjustedPurchasePrice,
      salePrice: adjustedSalePrice,
      acquisitionExpenses: adjustedAcquisitionExpenses,
      transferExpenses: adjustedTransferExpenses,
      capitalGain,
      longTermDeduction: 0,
      longTermDeductionRate: 0,
      basicDeduction: 0,
      taxableIncome: 0,
      taxRate: 0,
      capitalGainsTax: 0,
      localIncomeTax: 0,
      totalTax: 0,
      effectiveTaxRate: 0,
      netProceeds: adjustedSalePrice - adjustedPurchasePrice,
    };
  }

  // 1세대 1주택 비과세 체크 (12억원 한도)
  let adjustedCapitalGain = capitalGain;
  const TWELVE_BILLION = 1_200_000_000;

  if (isHouseType && isOnlyHouse && hasResided && holdingPeriodYears >= 2) {
    if (adjustedSalePrice <= TWELVE_BILLION) {
      // 12억 이하: 전액 비과세
      return {
        purchasePrice: adjustedPurchasePrice,
        salePrice: adjustedSalePrice,
        acquisitionExpenses: adjustedAcquisitionExpenses,
        transferExpenses: adjustedTransferExpenses,
        capitalGain,
        longTermDeduction: 0,
        longTermDeductionRate: 0,
        basicDeduction: 0,
        taxableIncome: 0,
        taxRate: 0,
        capitalGainsTax: 0,
        localIncomeTax: 0,
        totalTax: 0,
        effectiveTaxRate: 0,
        netProceeds: capitalGain,
      };
    } else {
      // 12억 초과: 초과분에 대한 양도차익만 과세
      const excessAmount = adjustedSalePrice - TWELVE_BILLION;
      const taxableRatio = excessAmount / adjustedSalePrice;
      adjustedCapitalGain = Math.floor(capitalGain * taxableRatio);
    }
  }

  // 장기보유특별공제 계산
  const longTermDeductionRate = calculateLongTermDeductionRate(
    holdingPeriodYears,
    propertyType,
    isOnlyHouse,
    hasResided
  );
  const longTermDeduction = Math.floor(adjustedCapitalGain * (longTermDeductionRate / 100));

  // 양도소득금액
  const capitalGainIncome = adjustedCapitalGain - longTermDeduction;

  // 기본공제 (250만원)
  const basicDeduction = 2_500_000;
  let taxableIncome = capitalGainIncome - basicDeduction;

  if (taxableIncome <= 0) {
    return {
      purchasePrice: adjustedPurchasePrice,
      salePrice: adjustedSalePrice,
      acquisitionExpenses: adjustedAcquisitionExpenses,
      transferExpenses: adjustedTransferExpenses,
      capitalGain,
      longTermDeduction,
      longTermDeductionRate,
      basicDeduction,
      taxableIncome: 0,
      taxRate: 0,
      capitalGainsTax: 0,
      localIncomeTax: 0,
      totalTax: 0,
      effectiveTaxRate: 0,
      netProceeds: capitalGain,
    };
  }

  // 누진세율 적용 (2024년 기준)
  const taxBrackets = [
    { limit: 14_000_000, rate: 6, deduction: 0 },
    { limit: 50_000_000, rate: 15, deduction: 1_260_000 },
    { limit: 88_000_000, rate: 24, deduction: 5_760_000 },
    { limit: 150_000_000, rate: 35, deduction: 15_440_000 },
    { limit: 300_000_000, rate: 38, deduction: 19_940_000 },
    { limit: 500_000_000, rate: 40, deduction: 25_940_000 },
    { limit: 1_000_000_000, rate: 42, deduction: 35_940_000 },
    { limit: Number.MAX_SAFE_INTEGER, rate: 45, deduction: 65_940_000 },
  ];

  let capitalGainsTax = 0;
  let taxRate = 0;

  for (const bracket of taxBrackets) {
    if (taxableIncome <= bracket.limit) {
      capitalGainsTax = Math.floor(taxableIncome * (bracket.rate / 100)) - bracket.deduction;
      capitalGainsTax = Math.max(0, capitalGainsTax);
      taxRate = bracket.rate;
      break;
    }
  }

  // 지방소득세 (양도소득세의 10%)
  const localIncomeTax = Math.floor(capitalGainsTax * 0.1);
  const totalTax = capitalGainsTax + localIncomeTax;

  // 실효세율
  const effectiveTaxRate = capitalGain > 0 ? Math.round((totalTax / capitalGain) * 10000) / 100 : 0;

  // 순수익
  const netProceeds = capitalGain - totalTax;

  return {
    purchasePrice: adjustedPurchasePrice,
    salePrice: adjustedSalePrice,
    acquisitionExpenses: adjustedAcquisitionExpenses,
    transferExpenses: adjustedTransferExpenses,
    capitalGain,
    longTermDeduction,
    longTermDeductionRate,
    basicDeduction,
    taxableIncome,
    taxRate,
    capitalGainsTax,
    localIncomeTax,
    totalTax,
    effectiveTaxRate,
    netProceeds,
  };
}

/**
 * 예상 중개수수료 계산
 */
export function estimateBrokerageFee(salePrice: number): number {
  let fee = 0;
  let maxFee = Number.MAX_SAFE_INTEGER;

  if (salePrice < 50_000_000) {
    fee = salePrice * 0.006;
    maxFee = 250_000;
  } else if (salePrice < 200_000_000) {
    fee = salePrice * 0.005;
    maxFee = 800_000;
  } else if (salePrice < 900_000_000) {
    fee = salePrice * 0.004;
  } else {
    fee = salePrice * 0.004;
  }

  return Math.floor(Math.min(fee, maxFee));
}

/**
 * 보유기간 계산 (년 단위)
 */
export function calculateHoldingPeriodYears(purchaseDate: Date | string): number {
  const purchase = typeof purchaseDate === "string" ? new Date(purchaseDate) : purchaseDate;
  const now = new Date();
  const diffTime = now.getTime() - purchase.getTime();
  const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);
  return Math.floor(diffYears);
}
