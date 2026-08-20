/**
 * 외부 자산 스냅샷 수집·합산 서비스 (Asset Hub Integration §2, §6 자본 준비)
 *
 * 수집: 설정된 소스별로 스냅샷을 가져와 ExternalAssetSnapshot 캐시를 통째 교체.
 * 실패한 소스는 마지막 성공값 유지 (last-known-good) — 실패가 0으로 잡혀
 * 합산이 출렁이면 안 된다 (§2.3).
 *
 * 스테일: as_of가 48시간을 넘으면 stale 표시 → UI는 "N일 전 기준" 뱃지.
 */

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  fetchAssetHubSnapshot,
  getConfiguredSnapshotSources,
} from "@/lib/api/asset-hub-snapshot";

export const SNAPSHOT_STALE_HOURS = 48;
const REFRESH_TTL_HOURS = 6;

export interface SnapshotItemSummary {
  category: string;
  label: string;
  valueKrw: number;
}

export interface SnapshotSourceSummary {
  source: string;
  asOf: string;
  collectedAt: string;
  stale: boolean;
  asOfDaysAgo: number;
  subtotalKrw: number;
  items: SnapshotItemSummary[];
}

export interface SnapshotSummary {
  totalKrw: number;
  sources: SnapshotSourceSummary[];
  configuredSourceCount: number;
  errors: string[];
}

interface SnapshotRow {
  source: string;
  category: string;
  label: string;
  valueKrw: bigint;
  asOf: Date;
  collectedAt: Date;
}

/** 캐시 행 → 소스별 요약 (순수 함수, 테스트 대상) */
export function summarizeSnapshotRows(
  rows: SnapshotRow[],
  now: Date = new Date()
): { totalKrw: number; sources: SnapshotSourceSummary[] } {
  const bySource = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const group = bySource.get(row.source) ?? [];
    bySource.set(row.source, [...group, row]);
  }

  const sources = [...bySource.entries()].map(([source, sourceRows]) => {
    const asOf = sourceRows.reduce(
      (latest, r) => (r.asOf > latest ? r.asOf : latest),
      sourceRows[0].asOf
    );
    const collectedAt = sourceRows.reduce(
      (latest, r) => (r.collectedAt > latest ? r.collectedAt : latest),
      sourceRows[0].collectedAt
    );
    const ageMs = now.getTime() - asOf.getTime();
    const subtotalKrw = sourceRows.reduce((sum, r) => sum + Number(r.valueKrw), 0);

    return {
      source,
      asOf: asOf.toISOString(),
      collectedAt: collectedAt.toISOString(),
      stale: ageMs > SNAPSHOT_STALE_HOURS * 60 * 60 * 1000,
      asOfDaysAgo: Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000))),
      subtotalKrw,
      items: sourceRows.map((r) => ({
        category: r.category,
        label: r.label,
        valueKrw: Number(r.valueKrw),
      })),
    };
  });

  const sorted = [...sources].sort((a, b) => a.source.localeCompare(b.source));
  const totalKrw = sorted.reduce((sum, s) => sum + s.subtotalKrw, 0);

  return { totalKrw, sources: sorted };
}

/**
 * 설정된 모든 소스에서 스냅샷을 수집해 캐시를 교체한다.
 * 소스 단위 트랜잭션 — 한 소스가 실패해도 다른 소스와 기존 캐시는 유지.
 */
export async function collectExternalSnapshots(): Promise<{ errors: string[] }> {
  const configs = getConfiguredSnapshotSources();
  const errors: string[] = [];

  for (const config of configs) {
    try {
      const snapshot = await fetchAssetHubSnapshot(config);
      const asOf = new Date(snapshot.as_of);
      if (Number.isNaN(asOf.getTime())) {
        throw new Error(`${config.source} as_of 파싱 실패: ${snapshot.as_of}`);
      }

      await prisma.$transaction([
        prisma.externalAssetSnapshot.deleteMany({
          where: { source: snapshot.source },
        }),
        prisma.externalAssetSnapshot.createMany({
          data: snapshot.items.map((item) => ({
            source: snapshot.source,
            category: item.category,
            label: item.label,
            valueKrw: BigInt(item.value_krw),
            asOf,
          })),
        }),
      ]);

      logger.info(
        `[snapshot] ${config.source} 수집 완료 (${snapshot.items.length}개 카테고리)`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `${config.source} 수집 실패`;
      logger.error(`[snapshot] ${config.source} 수집 실패:`, error);
      errors.push(message);
    }
  }

  return { errors };
}

/**
 * 스냅샷 합산 요약. 캐시가 없거나 REFRESH_TTL을 넘겼으면 수집을 먼저 시도한다.
 * forceRefresh는 수동 갱신 버튼용.
 */
export async function getSnapshotSummary(
  options: { forceRefresh?: boolean } = {}
): Promise<SnapshotSummary> {
  const configs = getConfiguredSnapshotSources();
  let errors: string[] = [];

  if (configs.length > 0) {
    const existing = await prisma.externalAssetSnapshot.findFirst({
      orderBy: { collectedAt: "desc" },
      select: { collectedAt: true },
    });
    const ttlExpired =
      !existing ||
      Date.now() - existing.collectedAt.getTime() >
        REFRESH_TTL_HOURS * 60 * 60 * 1000;

    if (options.forceRefresh || ttlExpired) {
      const result = await collectExternalSnapshots();
      errors = result.errors;
    }
  }

  const rows = await prisma.externalAssetSnapshot.findMany({
    orderBy: [{ source: "asc" }, { category: "asc" }],
  });

  const { totalKrw, sources } = summarizeSnapshotRows(rows);

  return {
    totalKrw,
    sources,
    configuredSourceCount: configs.length,
    errors,
  };
}
