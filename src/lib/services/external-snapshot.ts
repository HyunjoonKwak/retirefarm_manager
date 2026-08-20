/**
 * 허브 순자산 수집·캐시 서비스 (Asset Hub Integration §2.4, §6 자본 준비)
 *
 * my_portal 단일 소스에서 순자산을 받아 캐시한다. **자체 합산을 하지 않는다** —
 * `net_worth_krw`를 그대로 쓴다 (§1.5: 합산 로직도 SSOT는 my_portal).
 *
 * 실패한 수집은 마지막 성공값을 유지한다 (last-known-good). 실패가 0으로 잡혀
 * 자본 게이지가 출렁이면 안 된다.
 *
 * 스테일 판정도 하지 않는다: 허브가 `sources[].stale`로 내려준 플래그를
 * 그대로 UI에 전달한다 (소비자 자체 판단 금지 — §2.4).
 */

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  fetchHubNetWorth,
  getConfiguredHubSource,
  checkNetWorthIdentity,
  hubNetWorthSchema,
  type HubAssetItem,
  type HubLiabilityItem,
  type HubSourceStatus,
} from "@/lib/api/asset-hub-snapshot";

const CACHE_ID = "singleton";
const REFRESH_TTL_HOURS = 6;

export interface NetWorthSummary {
  /** 허브가 계산한 순자산 (원). 소비자는 재계산하지 않는다 */
  netWorthKrw: number;
  asOf: string;
  collectedAt: string;
  assets: HubAssetItem[];
  liabilities: HubLiabilityItem[];
  /** 허브가 전파한 부분 소스 상태 — stale 판정은 허브 소관 */
  sources: HubSourceStatus[];
  /** my_portal 연동 설정 여부 (미설정 시 게이지는 안내 문구만) */
  configured: boolean;
  errors: string[];
}

/** 캐시 payload → 계약 항목. 파싱 실패 시 빈 값 (캐시는 파생 데이터라 치명적이지 않다) */
function parsePayload(payload: string): {
  assets: HubAssetItem[];
  liabilities: HubLiabilityItem[];
  sources: HubSourceStatus[];
} {
  try {
    const parsed = hubNetWorthSchema
      .pick({ assets: true, liabilities: true, sources: true })
      .safeParse(JSON.parse(payload));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  return { assets: [], liabilities: [], sources: [] };
}

/**
 * 허브에서 순자산을 받아 캐시를 교체한다.
 * 실패해도 기존 캐시는 건드리지 않는다 (last-known-good).
 */
export async function collectHubNetWorth(): Promise<{ errors: string[] }> {
  const config = getConfiguredHubSource();
  if (!config) return { errors: [] };

  try {
    const data = await fetchHubNetWorth(config);

    const asOf = new Date(data.as_of);
    if (Number.isNaN(asOf.getTime())) {
      throw new Error(`as_of 파싱 실패: ${data.as_of}`);
    }

    // 항등식은 허브가 보장하는 계약 — 값을 고치지 않고 위반 사실만 남긴다
    if (!checkNetWorthIdentity(data)) {
      logger.warn(
        "[net-worth] §2.4 항등식 위반: Σassets − Σliabilities ≠ net_worth_krw"
      );
    }

    const payload = JSON.stringify({
      assets: data.assets,
      liabilities: data.liabilities,
      sources: data.sources,
    });

    const row = {
      netWorthKrw: BigInt(data.net_worth_krw),
      asOf,
      collectedAt: new Date(),
      payload,
    };

    await prisma.hubNetWorthCache.upsert({
      where: { id: CACHE_ID },
      update: row,
      create: { id: CACHE_ID, ...row },
    });

    logger.info(`[net-worth] my_portal 수집 완료 (${data.assets.length}개 자산 항목)`);
    return { errors: [] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "my_portal 순자산 수집 실패";
    logger.error("[net-worth] my_portal 수집 실패:", error);
    return { errors: [message] };
  }
}

/**
 * 자본 게이지용 순자산 요약. 캐시가 없거나 TTL이 지났으면 먼저 수집한다.
 * forceRefresh는 수동 갱신 버튼용.
 */
export async function getNetWorthSummary(
  options: { forceRefresh?: boolean } = {}
): Promise<NetWorthSummary> {
  const configured = getConfiguredHubSource() !== null;
  let errors: string[] = [];

  if (configured) {
    const cached = await prisma.hubNetWorthCache.findUnique({
      where: { id: CACHE_ID },
      select: { collectedAt: true },
    });
    const ttlExpired =
      !cached ||
      Date.now() - cached.collectedAt.getTime() >
        REFRESH_TTL_HOURS * 60 * 60 * 1000;

    if (options.forceRefresh || ttlExpired) {
      const result = await collectHubNetWorth();
      errors = result.errors;
    }
  }

  const row = await prisma.hubNetWorthCache.findUnique({
    where: { id: CACHE_ID },
  });

  if (!row) {
    return {
      netWorthKrw: 0,
      asOf: "",
      collectedAt: "",
      assets: [],
      liabilities: [],
      sources: [],
      configured,
      errors,
    };
  }

  const { assets, liabilities, sources } = parsePayload(row.payload);

  return {
    netWorthKrw: Number(row.netWorthKrw),
    asOf: row.asOf.toISOString(),
    collectedAt: row.collectedAt.toISOString(),
    assets,
    liabilities,
    sources,
    configured,
    errors,
  };
}
