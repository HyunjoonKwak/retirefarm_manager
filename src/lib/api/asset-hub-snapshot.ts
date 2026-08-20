/**
 * 허브 순자산 소비 클라이언트 (Asset Hub Integration §2.4)
 *
 * my_portal `GET /api/assets/net-worth` **단일 소스**를 읽기 전용으로 소비한다.
 *
 * 순자산 계산은 my_portal에만 존재한다 (§1.5 지배 원칙의 연장 — 합산 로직도 SSOT).
 * retirefarm은 portfolio/asset을 직접 합산하지 않는다: 그렇게 하면 현금·비부동산
 * 부채가 빠져 순자산이 과대 표시된다. `net_worth_krw`를 그대로 쓰고 재계산하지 않는다.
 */

import { z } from "zod";

const assetItemSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
  value_krw: z.number().int().nonnegative(),
  // 값의 실제 소유 서비스 — "소유 서비스에서 수정" 딥링크 근거 (§1.5 single writer)
  origin: z.string().min(1),
});

const liabilityItemSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
  // 부채는 양수로 표현한다 (음수 금지 — §2.4 부호 규칙)
  value_krw: z.number().int().nonnegative(),
});

const sourceStatusSchema = z.object({
  source: z.string().min(1),
  as_of: z.string().min(1),
  stale: z.boolean(),
  last_error: z.string().optional(),
});

export const hubNetWorthSchema = z.object({
  schema_version: z.literal(1),
  source: z.literal("my_portal"),
  as_of: z.string().min(1),
  base_currency: z.literal("KRW"),
  net_worth_krw: z.number().int(),
  assets: z.array(assetItemSchema),
  liabilities: z.array(liabilityItemSchema),
  sources: z.array(sourceStatusSchema).default([]),
});

export type HubNetWorth = z.infer<typeof hubNetWorthSchema>;
export type HubAssetItem = z.infer<typeof assetItemSchema>;
export type HubLiabilityItem = z.infer<typeof liabilityItemSchema>;
export type HubSourceStatus = z.infer<typeof sourceStatusSchema>;

export interface HubSourceConfig {
  baseUrl: string;
  token: string;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * my_portal 연동 설정. URL·토큰이 모두 있어야 활성 — 미설정이면 null이고
 * 자본 게이지는 "연동 없음"으로 표시된다 (기능만 비활성, 무해).
 */
export function getConfiguredHubSource(): HubSourceConfig | null {
  const baseUrl = process.env.MY_PORTAL_URL;
  const token = process.env.MY_PORTAL_SNAPSHOT_TOKEN;
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

/**
 * Σassets − Σliabilities === net_worth_krw 항등식 확인.
 * 허브가 보장하는 계약이라 **값을 고치지는 않는다** — 어긋나면 계약 위반이므로
 * 호출부가 경고를 남길 수 있도록 결과만 돌려준다.
 */
export function checkNetWorthIdentity(data: HubNetWorth): boolean {
  const assets = data.assets.reduce((sum, a) => sum + a.value_krw, 0);
  const liabilities = data.liabilities.reduce((sum, l) => sum + l.value_krw, 0);
  return assets - liabilities === data.net_worth_krw;
}

/**
 * 허브 순자산 조회. §2.4 계약으로 검증하고 source 명의까지 확인한다
 * (잘못된 엔드포인트에 연결된 상태를 조용히 통과시키지 않기 위해).
 */
export async function fetchHubNetWorth(
  config: HubSourceConfig
): Promise<HubNetWorth> {
  const response = await fetch(`${config.baseUrl}/api/assets/net-worth`, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`my_portal 순자산 응답 오류 (HTTP ${response.status})`);
  }

  const parsed = hubNetWorthSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      `my_portal 응답이 §2.4 계약과 불일치: ${parsed.error.issues[0]?.message}`
    );
  }

  return parsed.data;
}
