/**
 * 현금흐름 예측 계산기
 * 자금 유입/유출을 종합적으로 분석
 */

export interface CashFlowItem {
  id: string;
  date: Date;
  category: "INFLOW" | "OUTFLOW";
  type: string;
  description: string;
  amount: number;
  isRecurring: boolean;
  recurringInterval?: "MONTHLY" | "QUARTERLY" | "YEARLY";
}

export interface MonthlyProjection {
  month: string; // YYYY-MM
  year: number;
  monthNum: number;
  inflows: {
    type: string;
    amount: number;
    items: { description: string; amount: number }[];
  }[];
  outflows: {
    type: string;
    amount: number;
    items: { description: string; amount: number }[];
  }[];
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
}

export interface CashFlowProjectionResult {
  projections: MonthlyProjection[];
  summary: {
    totalInflow: number;
    totalOutflow: number;
    netCashFlow: number;
    lowestPoint: {
      month: string;
      amount: number;
    };
    highestPoint: {
      month: string;
      amount: number;
    };
    breakEvenMonth?: string;
  };
}

export interface ProjectionInput {
  // 자금 유입
  fundingSources: {
    type: string;
    description: string;
    amount: number;
    expectedDate: Date;
  }[];

  // 설립 비용 (일회성 유출)
  setupCosts: {
    description: string;
    amount: number;
    expectedDate: Date;
  }[];

  // 운영비 (월별 반복)
  monthlyOperatingCosts?: number;

  // 예상 월 수입 (영농 시작 후)
  monthlyFarmIncome?: number;
  farmStartDate?: Date;

  // 생활비
  monthlyLivingExpense?: number;

  // 시작 현금
  initialCash?: number;

  // 예측 기간 (개월)
  projectionMonths?: number;
}

/**
 * 현금흐름 예측 생성
 */
export function generateCashFlowProjection(input: ProjectionInput): CashFlowProjectionResult {
  const {
    fundingSources = [],
    setupCosts = [],
    monthlyOperatingCosts = 0,
    monthlyFarmIncome = 0,
    farmStartDate,
    monthlyLivingExpense = 0,
    initialCash = 0,
    projectionMonths = 24,
  } = input;

  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const projections: MonthlyProjection[] = [];
  let cumulativeCashFlow = initialCash;

  // 월별 예측 생성
  for (let i = 0; i < projectionMonths; i++) {
    const currentMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
    // End of month at 23:59:59.999 so same-day timestamps are included
    const monthEnd = new Date(startMonth.getFullYear(), startMonth.getMonth() + i + 1, 0, 23, 59, 59, 999);
    const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;

    const inflowsByType: Record<string, { amount: number; items: { description: string; amount: number }[] }> = {};
    const outflowsByType: Record<string, { amount: number; items: { description: string; amount: number }[] }> = {};

    // 자금 유입 처리
    for (const source of fundingSources) {
      const sourceDate = new Date(source.expectedDate);
      if (sourceDate >= currentMonth && sourceDate <= monthEnd) {
        if (!inflowsByType[source.type]) {
          inflowsByType[source.type] = { amount: 0, items: [] };
        }
        inflowsByType[source.type].amount += source.amount;
        inflowsByType[source.type].items.push({
          description: source.description,
          amount: source.amount,
        });
      }
    }

    // 설립 비용 처리
    for (const cost of setupCosts) {
      const costDate = new Date(cost.expectedDate);
      if (costDate >= currentMonth && costDate <= monthEnd) {
        if (!outflowsByType["설립비용"]) {
          outflowsByType["설립비용"] = { amount: 0, items: [] };
        }
        outflowsByType["설립비용"].amount += cost.amount;
        outflowsByType["설립비용"].items.push({
          description: cost.description,
          amount: cost.amount,
        });
      }
    }

    // 운영비 (매월)
    if (monthlyOperatingCosts > 0) {
      if (!outflowsByType["운영비"]) {
        outflowsByType["운영비"] = { amount: 0, items: [] };
      }
      outflowsByType["운영비"].amount += monthlyOperatingCosts;
      outflowsByType["운영비"].items.push({
        description: "월 운영비",
        amount: monthlyOperatingCosts,
      });
    }

    // 생활비 (매월)
    if (monthlyLivingExpense > 0) {
      if (!outflowsByType["생활비"]) {
        outflowsByType["생활비"] = { amount: 0, items: [] };
      }
      outflowsByType["생활비"].amount += monthlyLivingExpense;
      outflowsByType["생활비"].items.push({
        description: "월 생활비",
        amount: monthlyLivingExpense,
      });
    }

    // 영농 수입 (영농 시작 후)
    if (farmStartDate && monthlyFarmIncome > 0) {
      const farmStart = new Date(farmStartDate);
      if (currentMonth >= farmStart) {
        if (!inflowsByType["영농수입"]) {
          inflowsByType["영농수입"] = { amount: 0, items: [] };
        }
        inflowsByType["영농수입"].amount += monthlyFarmIncome;
        inflowsByType["영농수입"].items.push({
          description: "월 영농 수입",
          amount: monthlyFarmIncome,
        });
      }
    }

    // 합계 계산
    const totalInflow = Object.values(inflowsByType).reduce((sum, v) => sum + v.amount, 0);
    const totalOutflow = Object.values(outflowsByType).reduce((sum, v) => sum + v.amount, 0);
    const netCashFlow = totalInflow - totalOutflow;
    cumulativeCashFlow += netCashFlow;

    projections.push({
      month: monthKey,
      year: currentMonth.getFullYear(),
      monthNum: currentMonth.getMonth() + 1,
      inflows: Object.entries(inflowsByType).map(([type, data]) => ({
        type,
        ...data,
      })),
      outflows: Object.entries(outflowsByType).map(([type, data]) => ({
        type,
        ...data,
      })),
      totalInflow,
      totalOutflow,
      netCashFlow,
      cumulativeCashFlow,
    });
  }

  // 빈 예측 기간 방어 (reduce TypeError 방지)
  if (projections.length === 0) {
    return {
      projections: [],
      summary: {
        totalInflow: 0,
        totalOutflow: 0,
        netCashFlow: 0,
        lowestPoint: { month: "", amount: initialCash },
        highestPoint: { month: "", amount: initialCash },
        breakEvenMonth: undefined,
      },
    };
  }

  // 요약 계산
  const totalInflow = projections.reduce((sum, p) => sum + p.totalInflow, 0);
  const totalOutflow = projections.reduce((sum, p) => sum + p.totalOutflow, 0);

  const lowestProjection = projections.reduce((lowest, p) =>
    p.cumulativeCashFlow < lowest.cumulativeCashFlow ? p : lowest
  );
  const highestProjection = projections.reduce((highest, p) =>
    p.cumulativeCashFlow > highest.cumulativeCashFlow ? p : highest
  );

  // 손익분기점 찾기 (첫 달에 initialCash 음수에서 회복되는 경우 포함)
  let breakEvenMonth: string | undefined;
  let previousCumulative = initialCash;
  for (const projection of projections) {
    if (previousCumulative < 0 && projection.cumulativeCashFlow >= 0) {
      breakEvenMonth = projection.month;
      break;
    }
    previousCumulative = projection.cumulativeCashFlow;
  }

  return {
    projections,
    summary: {
      totalInflow,
      totalOutflow,
      netCashFlow: totalInflow - totalOutflow,
      lowestPoint: {
        month: lowestProjection.month,
        amount: lowestProjection.cumulativeCashFlow,
      },
      highestPoint: {
        month: highestProjection.month,
        amount: highestProjection.cumulativeCashFlow,
      },
      breakEvenMonth,
    },
  };
}
