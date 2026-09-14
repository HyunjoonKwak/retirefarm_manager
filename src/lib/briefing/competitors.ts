import prisma from "@/lib/prisma";
import { BriefingError } from "./queue";
import type { ShoppingSearchResult } from "./naver-shopping";
import { summarizeCompetitors } from "./competitor-stats";
import { SEARCH_RETIRED_MESSAGE, SEARCH_RETIRED_ON, type CompetitorRequest, type CompetitorOverview } from "./competitor-contracts";
const PRODUCT_PATH = /^\/([a-z0-9_-]{2,64})\/products\/(\d+)\/?$/i;
const RESERVED_SLUGS = ["products", "main", "inflow", "category", "search", "api"];
/** Exact hosts only: subdomains and look-alike hosts are rejected. Brand stores get a prefixed key so they never alias a smartstore slug. */
const HOSTS = new Map<string, (slug: string) => string>([["smartstore.naver.com", slug => slug], ["brand.naver.com", slug => `brand:${slug}`]]);
export function canonicalProductUrl(value: string) {
  const url = new URL(value);
  const match = PRODUCT_PATH.exec(url.pathname);
  const keyFor = HOSTS.get(url.hostname);
  if (url.protocol !== "https:" || !keyFor || url.port || url.username || url.password || !match)
    throw new BriefingError(400, "스마트스토어 또는 브랜드스토어의 실제 상품 주소를 입력해 주세요.");
  const slug = match[1].toLowerCase();
  if (RESERVED_SLUGS.includes(slug)) throw new BriefingError(400, "실제 판매자 상품 주소를 입력해 주세요.");
  return { storeKey: keyFor(slug), productUrl: `https://${url.hostname}/${slug}/products/${match[2]}` };
}
export async function competitorOverview(userId: string, now = new Date()): Promise<CompetitorOverview> {
  const [entries, search] = await Promise.all([
    prisma.competitorPanelEntry.findMany({ where: { userId }, orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }], take: 200,
      include: { observations: { where: { userId, observedAt: { lte: now } }, orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }], take: 60 } } }),
    prisma.competitorSearch.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  const serialized = entries.map(e => ({ ...e, createdAt: e.createdAt.toISOString(), archivedAt: e.archivedAt?.toISOString() ?? null,
    observations: e.observations.map(o => ({ ...o, observedAt: o.observedAt.toISOString(), createdAt: o.createdAt.toISOString() })) }));
  return { configured: false, searchRetiredOn: SEARCH_RETIRED_ON, asOf: now.toISOString(), target: 30, activeCount: serialized.filter(e => !e.archivedAt).length,
    latestSearch: search ? { id: search.id, createdAt: search.createdAt.toISOString(), status: search.status, errorCode: search.errorCode,
      result: search.response ? JSON.parse(search.response) as ShoppingSearchResult : null } : null,
    entries: serialized, groups: summarizeCompetitors(serialized, now),
    limitations: [SEARCH_RETIRED_MESSAGE,
      "직접 확인해 기록한 동일 품목·품종군·품질군·중량·크기 등급·크기 기준만 비교합니다. 최근 7일 내 재고 있음·배송비 확인 관측이 서로 다른 3개 점포 이상이어야 대표 가격을 산출합니다.",
      "크기 등급이 미확인이거나 크기 기준(직경·과수 경계)을 기록하지 않은 점포는 통계에서 제외됩니다. 판매자 표기는 자동으로 등급에 대응시키지 않으니 직접 확인해 입력하세요.",
      "전주 변화는 현재와 7일 전 각각 최근 7일 내 기록이 있는 동일 옵션의 고정 점포끼리만 비교합니다. 할인·쿠폰 조건은 메모를 함께 확인하세요.",
      "최근 패널 200개와 패널별 최신 관측 60개를 표시합니다. 품절·미확인은 가격 0원이나 변화 없음이 아닙니다."],
  };
}
export async function mutateCompetitors(userId: string, input: CompetitorRequest, now = new Date()) {
  // The upstream API is gone: answer before any network call or database write, regardless of server credentials.
  if (input.action === "search") throw new BriefingError(410, SEARCH_RETIRED_MESSAGE);
  if (input.action === "addPanel") {
    const { productUrl, storeKey } = canonicalProductUrl(input.productUrl);
    return prisma.$transaction(async tx => {
      if (await tx.competitorPanelEntry.count({ where: { userId, archivedAt: null } }) >= 30)
        throw new BriefingError(409, "고정 비교군은 30곳까지입니다. 교체할 점포를 먼저 보관 처리해 주세요.");
      if (await tx.competitorPanelEntry.findUnique({ where: { userId_activeStoreKey: { userId, activeStoreKey: storeKey } } }))
        throw new BriefingError(409, "이미 고정 비교군에 있는 점포입니다. 옵션 변경 시 기존 항목을 보관하고 다시 등록해 주세요.");
      const fields = { storeName: input.storeName, productName: input.productName, varietyGroup: input.varietyGroup, qualityGroup: input.qualityGroup,
        optionLabel: input.optionLabel, packageKg: input.packageKg, sizeGrade: input.sizeGrade, sizeCriteria: input.sizeCriteria };
      const entry = await tx.competitorPanelEntry.create({ data: { ...fields, userId, productUrl, storeKey, activeStoreKey: storeKey } });
      return { ok: true, id: entry.id };
    });
  }
  return prisma.$transaction(async tx => {
    const entry = await tx.competitorPanelEntry.findFirst({ where: { id: input.entryId, userId, archivedAt: null } });
    if (!entry) throw new BriefingError(404, "기록할 수 있는 비교군을 찾지 못했습니다.");
    if (input.action === "archive") {
      await tx.competitorPanelEntry.update({ where: { id: entry.id }, data: { archivedAt: now, archiveReason: input.reason, activeStoreKey: null } });
      return { ok: true };
    }
    const observedAt = new Date(input.observedAt);
    if (observedAt.getTime() > now.getTime() || observedAt.getTime() < Date.UTC(2000,0,1))
      throw new BriefingError(400, "관측 시각은 실제 확인한 과거 또는 현재 시각이어야 합니다.");
    if (input.availability === "IN_STOCK" && (input.price === null || input.price <= 0))
      throw new BriefingError(400, "판매 중인 상품은 확인한 양수 가격을 입력해 주세요.");
    const data = { userId, entryId: entry.id, observedAt, price: input.price, shippingFee: input.shippingFee,
      availability: input.availability, notes: input.notes || null };
    const existing = await tx.competitorPriceObservation.findFirst({ where: data });
    if (existing) return { ok: true, id: existing.id, duplicate: true };
    const observation = await tx.competitorPriceObservation.create({ data });
    return { ok: true, id: observation.id };
  });
}
