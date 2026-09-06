import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateFundingRequirement,
  setupCostLineNet,
  setupCostLineTotal,
} from "@/lib/calculators/funding-requirement";

describe("calculateFundingRequirement", () => {
  it("quantity와 보조금을 반영하고 생활비 버퍼를 더한 값이 필요 자금이다", () => {
    const result = calculateFundingRequirement({
      setupCosts: [
        { estimatedCost: 10_000_000, quantity: 3, subsidyAmount: 5_000_000 },
        { estimatedCost: "2000000" },
      ],
      fundingSources: [
        { amount: 10_000_000, status: "COMPLETED" },
        { amount: 5_000_000, status: "PLANNED" },
      ],
      monthlyLivingExpense: 3_000_000,
      bufferMonths: 6,
    });

    expect(result.totalSetupCost.toNumber()).toBe(32_000_000);
    expect(result.totalSubsidy.toNumber()).toBe(5_000_000);
    expect(result.netSetupCost.toNumber()).toBe(27_000_000);
    expect(result.initialLivingBuffer.toNumber()).toBe(18_000_000);
    expect(result.totalRequiredFunds.toNumber()).toBe(45_000_000);
    expect(result.totalFundingPlanned.toNumber()).toBe(15_000_000);
    expect(result.totalFundingSecured.toNumber()).toBe(10_000_000);
    expect(result.fundingGap.toNumber()).toBe(30_000_000);
    expect(result.fundingShortfall.toNumber()).toBe(30_000_000);
    expect(result.fundingProgress).toBe(33);
    expect(result.fundingRatio).toBe(33.33);
  });

  it("생활비가 없으면 버퍼 0, 초과 조달이면 gap이 음수이고 progress는 100에서 멈춘다", () => {
    const result = calculateFundingRequirement({
      setupCosts: [{ estimatedCost: 10_000_000 }],
      fundingSources: [{ amount: 15_000_000, status: "PLANNED" }],
    });
    expect(result.initialLivingBuffer.toNumber()).toBe(0);
    expect(result.bufferMonths).toBe(6);
    expect(result.fundingGap.toNumber()).toBe(-5_000_000);
    expect(result.fundingShortfall.toNumber()).toBe(0);
    expect(result.fundingProgress).toBe(100);
    expect(result.fundingRatio).toBe(150);
  });

  it("필요 자금이 0이면 progress/ratio는 0이다", () => {
    const result = calculateFundingRequirement({ setupCosts: [], fundingSources: [] });
    expect(result.fundingProgress).toBe(0);
    expect(result.fundingRatio).toBe(0);
  });

  it("소수 Decimal 금액이 섞여 있어도 예외 없이 계산한다", () => {
    const result = calculateFundingRequirement({
      setupCosts: [{ estimatedCost: new Prisma.Decimal("1000000.5"), quantity: 2 }],
      fundingSources: [{ amount: new Prisma.Decimal("1500000.5"), status: "PLANNED" }],
    });
    expect(result.totalSetupCost.toFixed()).toBe("2000001");
    expect(result.totalFundingPlanned.toFixed()).toBe("1500000.5");
  });

  it("라인 합계는 quantity 미만 1을 1로, 보조금 초과는 0으로 처리한다", () => {
    expect(setupCostLineTotal({ estimatedCost: 100, quantity: 0 }).toNumber()).toBe(100);
    expect(setupCostLineTotal({ estimatedCost: 100, quantity: 2.7 }).toNumber()).toBe(200);
    expect(setupCostLineNet({ estimatedCost: 100, subsidyAmount: 150 }).toNumber()).toBe(0);
  });
});
