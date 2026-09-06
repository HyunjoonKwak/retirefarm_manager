import { NextResponse } from "next/server";
import { isMarketSchedulerReady } from "@/lib/scheduler";
import { isMarketRecoveryReady } from "@/lib/market-recovery-scheduler";
export const dynamic = "force-dynamic";
export async function GET() {
  const marketSchedulerReady = isMarketSchedulerReady();
  const marketRecoveryReady = isMarketRecoveryReady();
  const ready = marketSchedulerReady && marketRecoveryReady;
  return NextResponse.json({ ready, marketSchedulerReady, marketRecoveryReady }, { status: ready ? 200 : 503 });
}
