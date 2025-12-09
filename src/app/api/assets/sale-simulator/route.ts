import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/options";
import {
  analyzeOptimalSaleOrder,
  previewAssetSale,
  findMinimumSalesForTarget,
  type SaleAsset,
} from "@/lib/calculators/sale-simulator";

const saleAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  propertyType: z.enum(["HOUSE", "COMMERCIAL", "LAND", "OFFICETEL_RESIDENTIAL"]),
  purchasePrice: z.number().min(0),
  currentPrice: z.number().min(0),
  acquisitionExpenses: z.number().min(0).default(0),
  holdingPeriodYears: z.number().min(0),
  isOnlyHouse: z.boolean().default(false),
  hasResided: z.boolean().default(false),
  ownershipShare: z.number().min(0).max(100).default(100),
});

const simulatorSchema = z.object({
  assets: z.array(saleAssetSchema).min(1, "최소 1개 이상의 자산이 필요합니다."),
  targetAmount: z.number().min(0).optional(),
  mode: z.enum(["optimal", "preview", "target"]).default("optimal"),
  previewAssetId: z.string().optional(),
  previewSalePrice: z.number().optional(),
});

// POST: 매도 시뮬레이션 실행
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = simulatorSchema.parse(body);

    const assets: SaleAsset[] = validatedData.assets;

    switch (validatedData.mode) {
      case "optimal": {
        const result = analyzeOptimalSaleOrder(assets);
        return NextResponse.json({ result });
      }

      case "preview": {
        if (!validatedData.previewAssetId) {
          return NextResponse.json(
            { error: "미리보기할 자산 ID가 필요합니다." },
            { status: 400 }
          );
        }
        const asset = assets.find((a) => a.id === validatedData.previewAssetId);
        if (!asset) {
          return NextResponse.json(
            { error: "해당 자산을 찾을 수 없습니다." },
            { status: 404 }
          );
        }
        const previewResult = previewAssetSale(asset, validatedData.previewSalePrice);
        return NextResponse.json({ result: previewResult });
      }

      case "target": {
        if (validatedData.targetAmount === undefined) {
          return NextResponse.json(
            { error: "목표 금액이 필요합니다." },
            { status: 400 }
          );
        }
        const targetResult = findMinimumSalesForTarget(assets, validatedData.targetAmount);
        return NextResponse.json({ result: targetResult });
      }

      default:
        return NextResponse.json(
          { error: "지원하지 않는 모드입니다." },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    console.error("Sale simulator error:", error);
    return NextResponse.json(
      { error: "시뮬레이션 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
