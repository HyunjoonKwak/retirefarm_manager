import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { BriefingError } from "./queue";
import { searchNaverShopping, ShoppingSearchError, type ShoppingSearchResult } from "./naver-shopping";
import { summarizeCompetitors } from "./competitor-stats";
import type { CompetitorRequest, CompetitorOverview } from "./competitor-contracts";
const FIVE_MINUTES = 300000;
function credentials() {
  const clientId = process.env.NAVER_SHOPPING_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_SHOPPING_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
export function canonicalProductUrl(value: string) {
  const url = new URL(value);
  const match = /^\/([a-z0-9_-]{2,64})\/products\/(\d+)\/?$/i.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "smartstore.naver.com" || url.port || url.username || url.password || !match)
    throw new BriefingError(400, "스마트스토어의 실제 상품 주소를 입력해 주세요.");
  const storeKey = match[1].toLowerCase();
  if (["products", "main", "inflow", "category", "search", "api"].includes(storeKey)) throw new BriefingError(400, "실제 판매자 상품 주소를 입력해 주세요.");
  return { storeKey, productUrl: `https://smartstore.naver.com/${storeKey}/products/${match[2]}` };
}
export async function competitorOverview(userId: string, now = new Date()): Promise<CompetitorOverview> {
  const [entries, search] = await Promise.all([
    prisma.competitorPanelEntry.findMany({ where: { userId }, orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }], take: 200,
      include: { observations: { where: { userId, observedAt: { lte: now } }, orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }], take: 60 } } }),
    prisma.competitorSearch.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  const serialized = entries.map(e => ({ ...e, createdAt: e.createdAt.toISOString(), archivedAt: e.archivedAt?.toISOString() ?? null,
    observations: e.observations.map(o => ({ ...o, observedAt: o.observedAt.toISOString(), createdAt: o.createdAt.toISOString() })) }));
  return { configured: !!credentials(), asOf: now.toISOString(), target: 30, activeCount: serialized.filter(e => !e.archivedAt).length,
    latestSearch: search ? { id: search.id, createdAt: search.createdAt.toISOString(), status: search.status, errorCode: search.errorCode,
      result: search.response ? JSON.parse(search.response) as ShoppingSearchResult : null } : null,
    entries: serialized, groups: summarizeCompetitors(serialized, now),
    limitations: ["검색 결과는 후보이며 API 노출 순서는 비광고 순위가 아닙니다. 최저가는 실제 선택 옵션 가격이 아닐 수 있습니다.",
      "직접 확인해 기록한 동일 품목·품종군·품질군·중량만 비교합니다. 최근 7일 내 재고 있음·배송비 확인 관측이 서로 다른 3개 점포 이상이어야 대표 가격을 산출합니다.",
      "전주 변화는 현재와 7일 전 각각 최근 7일 내 기록이 있는 동일 옵션의 고정 점포끼리만 비교합니다. 할인·쿠폰 조건은 메모를 함께 확인하세요.",
      "최근 패널 200개와 패널별 최신 관측 60개를 표시합니다. 검색 실패·품절·미확인은 가격 0원이나 변화 없음이 아닙니다."],
  };
}
async function reserveSearch(userId: string, query: string, now: Date) {
  const bucket = String(Math.floor(now.getTime()/FIVE_MINUTES));
  try {
    return await prisma.$transaction(async tx => {
      const cached = await tx.competitorSearch.findUnique({ where: { userId_query_bucket: { userId, query, bucket } } });
      if (cached) return { row: cached, cached: true };
      if (await tx.competitorSearch.count({ where: { userId, createdAt: { gte: new Date(now.getTime()-86400000) } } }) >= 20)
        throw new BriefingError(429, "검색은 하루에 20회까지 가능합니다.");
      if (await tx.competitorSearch.count({ where: { userId, createdAt: { gte: new Date(now.getTime()-FIVE_MINUTES) } } }))
        throw new BriefingError(429, "다음 검색은 5분 후에 가능합니다. 기존 후보를 먼저 검토해 주세요.");
      return { row: await tx.competitorSearch.create({ data: { userId, query, bucket, createdAt: now } }), cached: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2028"].includes(error.code))
      throw new BriefingError(409, "검색이 처리 중입니다. 잠시 후 새로고침해 주세요.");
    throw error;
  }
}
export async function mutateCompetitors(userId: string, input: CompetitorRequest, now = new Date()) {
  if (input.action === "search") {
    const auth = credentials();
    if (!auth) throw new BriefingError(503, "서버에 네이버 공식 쇼핑검색 키를 설정해야 합니다.");
    const query = input.query.replace(/\s+/g, " ").trim();
    const { row, cached } = await reserveSearch(userId, query, now);
    if (cached) {
      if (row.status !== "SUCCEEDED") throw new BriefingError(409, "기존 검색이 진행 중이거나 실패했습니다. 5분 후 다시 시도해 주세요.");
      return { ok: true, cached: true };
    }
    try {
      const result = await searchNaverShopping(query, auth);
      await prisma.competitorSearch.update({ where: { id: row.id }, data: { status: "SUCCEEDED", response: JSON.stringify(result) } });
    } catch (error) {
      const code = error instanceof ShoppingSearchError ? error.code : "UNEXPECTED";
      await prisma.competitorSearch.update({ where: { id: row.id }, data: { status: "FAILED", errorCode: code } });
      throw new BriefingError(502, error instanceof ShoppingSearchError ? error.message : "검색을 완료하지 못했습니다.");
    }
    return { ok: true, cached: false };
  }
  if (input.action === "addPanel") {
    const { productUrl, storeKey } = canonicalProductUrl(input.productUrl);
    return prisma.$transaction(async tx => {
      if (await tx.competitorPanelEntry.count({ where: { userId, archivedAt: null } }) >= 30)
        throw new BriefingError(409, "고정 비교군은 30곳까지입니다. 교체할 점포를 먼저 보관 처리해 주세요.");
      if (await tx.competitorPanelEntry.findUnique({ where: { userId_activeStoreKey: { userId, activeStoreKey: storeKey } } }))
        throw new BriefingError(409, "이미 고정 비교군에 있는 점포입니다. 옵션 변경 시 기존 항목을 보관하고 다시 등록해 주세요.");
      const fields = { storeName: input.storeName, productName: input.productName, varietyGroup: input.varietyGroup, qualityGroup: input.qualityGroup, optionLabel: input.optionLabel, packageKg: input.packageKg };
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
