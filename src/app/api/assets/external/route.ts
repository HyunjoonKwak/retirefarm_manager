import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { externalPortfolioClient } from "@/lib/api/external-portfolio";

// GET: 외부 포트폴리오 자산 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const tradeType = searchParams.get("tradeType");

    let assets;
    switch (tradeType) {
      case "OWNED":
        assets = await externalPortfolioClient.getOwnedAssets(userId);
        break;
      case "FOR_SALE":
        assets = await externalPortfolioClient.getForSaleAssets(userId);
        break;
      case "SOLD":
        assets = await externalPortfolioClient.getSoldAssets(userId);
        break;
      default:
        assets = await externalPortfolioClient.getAllAssets(userId);
    }

    const summary = await externalPortfolioClient.getSummary(userId);

    return NextResponse.json({
      assets,
      summary,
    });
  } catch (error) {
    console.error("Get external assets error:", error);

    // 외부 API 연결 실패 시 빈 결과 반환
    return NextResponse.json({
      assets: [],
      summary: {
        totalAssets: 0,
        totalValue: "0",
        totalAcquisitionCost: "0",
        totalLoanAmount: "0",
        totalUnrealizedGain: "0",
        averageYieldRate: 0,
      },
      error: "외부 포트폴리오 서비스에 연결할 수 없습니다.",
    });
  }
}
