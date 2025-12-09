import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/options";
import {
  calculateCapitalGainsTax,
  estimateBrokerageFee,
  calculateHoldingPeriodYears,
  type PropertyType,
} from "@/lib/calculators/capital-gains-tax";

const taxCalculatorSchema = z.object({
  salePrice: z.number().min(0, "매도가는 0 이상이어야 합니다."),
  purchasePrice: z.number().min(0, "취득가는 0 이상이어야 합니다."),
  acquisitionExpenses: z.number().min(0).default(0),
  transferExpenses: z.number().min(0).optional(),
  holdingPeriodYears: z.number().min(0).optional(),
  purchaseDate: z.string().optional(),
  propertyType: z.enum(["HOUSE", "COMMERCIAL", "LAND", "OFFICETEL_RESIDENTIAL"]).default("HOUSE"),
  isOnlyHouse: z.boolean().default(false),
  hasResided: z.boolean().default(false),
  ownershipShare: z.number().min(0).max(100).default(100),
  includeEstimatedBrokerageFee: z.boolean().default(false),
});

// POST: 양도소득세 계산
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = taxCalculatorSchema.parse(body);

    // 보유기간 계산
    let holdingPeriodYears = validatedData.holdingPeriodYears ?? 0;
    if (!holdingPeriodYears && validatedData.purchaseDate) {
      holdingPeriodYears = calculateHoldingPeriodYears(validatedData.purchaseDate);
    }

    // 양도비용 계산 (중개수수료 자동 추정 옵션)
    let transferExpenses = validatedData.transferExpenses ?? 0;
    const estimatedBrokerageFee = estimateBrokerageFee(validatedData.salePrice);

    if (validatedData.includeEstimatedBrokerageFee && !transferExpenses) {
      transferExpenses = estimatedBrokerageFee;
    }

    const result = calculateCapitalGainsTax({
      salePrice: validatedData.salePrice,
      purchasePrice: validatedData.purchasePrice,
      acquisitionExpenses: validatedData.acquisitionExpenses,
      transferExpenses,
      holdingPeriodYears,
      propertyType: validatedData.propertyType as PropertyType,
      isOnlyHouse: validatedData.isOnlyHouse,
      hasResided: validatedData.hasResided,
      ownershipShare: validatedData.ownershipShare,
    });

    return NextResponse.json({
      result,
      inputs: {
        ...validatedData,
        holdingPeriodYears,
        transferExpenses,
        estimatedBrokerageFee,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    console.error("Tax calculator error:", error);
    return NextResponse.json(
      { error: "세금 계산 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
