/**
 * 설립비 항목을 현금흐름 예측의 월별 유출로 배치한다 (리뷰 A2).
 *
 * 규칙
 * - paidAt이 있으면 이미 지출한 것으로 보고 미래 유출에서 제외한다.
 *   (지출액은 사용자가 "현재 보유 현금"에 이미 반영했다고 본다 — 자동 차감하지 않는다)
 * - plannedDate가 예측 시작 이후면 그 달에 계상한다.
 * - plannedDate가 예측 시작보다 과거면(기한 경과, 미지출) 예측 첫 달에 계상한다.
 * - plannedDate가 없으면 영농 시작일이 예측 구간 안에 있을 때 그 달, 아니면 예측 첫 달에
 *   계상한다. 어느 달로 가정했는지 assumptions에 남겨 화면에 표시한다.
 * - 기존 데이터는 plannedDate/paidAt이 null이므로 위 폴백이 그대로 적용된다
 *   (등록일(createdAt)로 과거를 추정하지 않는다).
 */
import { addMonths, getMonthRangeOf, type MonthRange } from "@/lib/utils/month-range";
import { setupCostLineNet } from "@/lib/calculators/funding-requirement";
import type { DecimalLike } from "@/lib/utils/money";

export type SetupCostScheduleSource = "planned" | "overdue" | "fallback";

export interface SetupCostScheduleItem {
  id?: string;
  name: string;
  estimatedCost: DecimalLike;
  quantity?: number | null;
  subsidyAmount?: DecimalLike;
  plannedDate?: Date | null;
  paidAt?: Date | null;
}

export interface SetupCostScheduleOptions {
  /** 예측 첫 달의 임의 시각 (그 달 1일로 정규화) */
  projectionStart: Date;
  farmStartDate?: Date | null;
  projectionMonths?: number;
}

export interface ScheduledSetupCost {
  id?: string;
  description: string;
  amount: number;
  expectedDate: Date;
  source: SetupCostScheduleSource;
}

export interface SetupCostScheduleAssumptions {
  /** plannedDate가 없는 항목을 배치한 달 (YYYY-MM) */
  fallbackMonth: string;
  fallbackReason: "farmStartDate" | "projectionStart";
  undatedCount: number;
  overdueCount: number;
  paidCount: number;
  paidAmount: number;
  scheduledAmount: number;
}

export interface SetupCostScheduleResult {
  costs: ScheduledSetupCost[];
  assumptions: SetupCostScheduleAssumptions;
}

function resolveFallback(
  startRange: MonthRange,
  farmStartDate: Date | null | undefined,
  projectionMonths: number
): { month: MonthRange; reason: SetupCostScheduleAssumptions["fallbackReason"] } {
  if (farmStartDate && farmStartDate.getTime() >= startRange.start.getTime() && farmStartDate.getTime() < addMonths(startRange, projectionMonths).start.getTime()) {
    return { month: getMonthRangeOf(farmStartDate), reason: "farmStartDate" };
  }
  return { month: startRange, reason: "projectionStart" };
}

export function scheduleSetupCosts(
  items: SetupCostScheduleItem[],
  options: SetupCostScheduleOptions
): SetupCostScheduleResult {
  const startRange = getMonthRangeOf(options.projectionStart);
  const fallback = resolveFallback(startRange, options.farmStartDate, options.projectionMonths ?? 24);

  const initial: SetupCostScheduleResult = {
    costs: [],
    assumptions: {
      fallbackMonth: fallback.month.key,
      fallbackReason: fallback.reason,
      undatedCount: 0,
      overdueCount: 0,
      paidCount: 0,
      paidAmount: 0,
      scheduledAmount: 0,
    },
  };

  return items.reduce<SetupCostScheduleResult>((acc, item) => {
    const amount = setupCostLineNet(item).toNumber();

    if (item.paidAt) {
      return {
        ...acc,
        assumptions: {
          ...acc.assumptions,
          paidCount: acc.assumptions.paidCount + 1,
          paidAmount: acc.assumptions.paidAmount + amount,
        },
      };
    }

    if (amount <= 0) return acc;

    const placement = placeItem(item, startRange, fallback.month);
    const cost: ScheduledSetupCost = {
      id: item.id,
      description: item.name,
      amount,
      expectedDate: placement.date,
      source: placement.source,
    };

    return {
      costs: [...acc.costs, cost],
      assumptions: {
        ...acc.assumptions,
        undatedCount: acc.assumptions.undatedCount + (placement.source === "fallback" ? 1 : 0),
        overdueCount: acc.assumptions.overdueCount + (placement.source === "overdue" ? 1 : 0),
        scheduledAmount: acc.assumptions.scheduledAmount + amount,
      },
    };
  }, initial);
}

function placeItem(
  item: SetupCostScheduleItem,
  startRange: MonthRange,
  fallbackMonth: MonthRange
): { date: Date; source: SetupCostScheduleSource } {
  if (!item.plannedDate) {
    return { date: fallbackMonth.start, source: "fallback" };
  }
  if (item.plannedDate.getTime() < startRange.start.getTime()) {
    return { date: startRange.start, source: "overdue" };
  }
  return { date: item.plannedDate, source: "planned" };
}
