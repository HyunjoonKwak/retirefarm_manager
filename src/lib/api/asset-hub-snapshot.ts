/**
 * Asset Hub 스냅샷 소비 클라이언트 (Asset Hub Integration §2)
 *
 * 각 제공 서비스(portfolio_manager, asset_manager)의 GET /api/assets/snapshot을
 * 읽기 전용으로 소비한다. 인증은 웹 세션과 분리된 불투명 Bearer 서비스 토큰
 * (각 제공 서비스가 CLI로 발급, DB엔 sha256만 저장).
 *
 * 지배 원칙(§1.5): 이 클라이언트는 절대 역방향으로 쓰지 않는다.
 * 값이 틀렸으면 소유 서비스에서 고친다.
 */

import { z } from "zod";

const snapshotOriginalSchema = z.object({
  currency: z.string().min(1),
  value: z.number(),
  fx_rate: z.number(),
  fx_as_of: z.string(),
});

const snapshotItemSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
  value_krw: z.number().int(),
  original: snapshotOriginalSchema.optional(),
});

export const assetHubSnapshotSchema = z.object({
  schema_version: z.literal(1),
  source: z.string().min(1),
  as_of: z.string().min(1),
  base_currency: z.literal("KRW"),
  items: z.array(snapshotItemSchema),
});

export type AssetHubSnapshot = z.infer<typeof assetHubSnapshotSchema>;
export type AssetHubSnapshotItem = z.infer<typeof snapshotItemSchema>;

export interface SnapshotSourceConfig {
  source: string;
  baseUrl: string;
  token: string;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * 환경변수에 URL·토큰이 모두 설정된 소스만 반환한다.
 * 미설정 소스는 조용히 제외 — 대시보드는 설정된 소스만 합산한다.
 */
export function getConfiguredSnapshotSources(): SnapshotSourceConfig[] {
  const candidates = [
    {
      source: "portfolio_manager",
      baseUrl: process.env.PORTFOLIO_MANAGER_URL,
      token: process.env.PORTFOLIO_MANAGER_SNAPSHOT_TOKEN,
    },
    {
      source: "asset_manager",
      baseUrl:
        process.env.ASSET_MANAGER_URL || process.env.EXTERNAL_PORTFOLIO_API_URL,
      token: process.env.ASSET_MANAGER_SNAPSHOT_TOKEN,
    },
  ];

  return candidates
    .filter((c): c is SnapshotSourceConfig & typeof c => Boolean(c.baseUrl && c.token))
    .map((c) => ({
      source: c.source,
      baseUrl: c.baseUrl.replace(/\/$/, ""),
      token: c.token,
    }));
}

/**
 * 단일 소스의 스냅샷을 가져와 §2.2 계약으로 검증한다.
 * source 명의가 설정과 다르면 실패 처리 (잘못된 엔드포인트 연결 방지).
 */
export async function fetchAssetHubSnapshot(
  config: SnapshotSourceConfig
): Promise<AssetHubSnapshot> {
  const response = await fetch(`${config.baseUrl}/api/assets/snapshot`, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${config.source} 스냅샷 응답 오류 (HTTP ${response.status})`);
  }

  const parsed = assetHubSnapshotSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`${config.source} 스냅샷이 §2.2 계약과 불일치: ${parsed.error.issues[0]?.message}`);
  }

  if (parsed.data.source !== config.source) {
    throw new Error(
      `스냅샷 source 불일치: 기대 ${config.source}, 실제 ${parsed.data.source}`
    );
  }

  return parsed.data;
}
