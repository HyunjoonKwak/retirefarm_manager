import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { BriefingError } from "./queue";
import type { ShoppingSearchResult } from "./naver-shopping";
import { summarizeCompetitors } from "./competitor-stats";
import { MAX_ACTIVE_OPTIONS_PER_STORE, MAX_ACTIVE_STORES, PANEL_ACTIVE_READ_CAP, PANEL_READ_CAP, SEARCH_RETIRED_MESSAGE, SEARCH_RETIRED_ON,
  type CompetitorRequest, type CompetitorOverview } from "./competitor-contracts";
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
/**
 * Stable identity of one seller option: canonical product URL + trimmed option label + package weight. Identity dimensions
 * (cultivar, color, size...) are deliberately excluded so a correction never registers the same real option twice;
 * such corrections require archive and re-registration.
 */
export function optionKeyOf(option: { productUrl: string; optionLabel: string; packageKg: number }) {
  return createHash("sha256").update(JSON.stringify([option.productUrl, option.optionLabel.trim(), String(option.packageKg)])).digest("hex");
}
const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
export async function competitorOverview(userId: string, now = new Date()): Promise<CompetitorOverview> {
  const [entries, search] = await Promise.all([
    // Active rows (NULL archivedAt) sort first, so the cap can never hide an active option: at most 30 x 10 exist.
    prisma.competitorPanelEntry.findMany({ where: { userId }, orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }], take: PANEL_READ_CAP,
      include: { observations: { where: { userId, observedAt: { lte: now } }, orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }], take: 60 } } }),
    prisma.competitorSearch.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  const serialized = entries.map(e => ({ ...e, createdAt: e.createdAt.toISOString(), archivedAt: e.archivedAt?.toISOString() ?? null,
    observations: e.observations.map(o => ({ ...o, observedAt: o.observedAt.toISOString(), createdAt: o.createdAt.toISOString() })) }));
  const active = serialized.filter(e => !e.archivedAt);
  return { configured: false, searchRetiredOn: SEARCH_RETIRED_ON, asOf: now.toISOString(), target: MAX_ACTIVE_STORES,
    activeCount: new Set(active.map(e => e.storeKey)).size, activeOptionCount: active.length,
    latestSearch: search ? { id: search.id, createdAt: search.createdAt.toISOString(), status: search.status, errorCode: search.errorCode,
      result: search.response ? JSON.parse(search.response) as ShoppingSearchResult : null } : null,
    entries: serialized, groups: summarizeCompetitors(serialized, now),
    limitations: [SEARCH_RETIRED_MESSAGE,
      "직접 확인해 기록한 동일 품목·품종군·품종명·색상·구성·가공·품질군·중량·크기 등급·크기 기준만 비교합니다. 최근 7일 내 재고 있음·배송비 확인 관측이 서로 다른 3개 점포 이상이어야 대표 가격을 산출합니다.",
      "크기 등급이 미확인이거나 크기 기준(직경·과수 경계)을 기록하지 않은 점포는 통계에서 제외됩니다. 판매자 표기는 자동으로 등급에 대응시키지 않으니 직접 확인해 입력하세요.",
      "품종명이 비어 있거나 색상·구성·가공이 미확인·기타인 점포, 혼합 구성 점포는 통계에서 제외됩니다. 품종명은 판매자 표기를 그대로 적고(앞뒤 공백만 제거) 별칭·유사 표기는 서로 다른 옵션으로 취급합니다.",
      "이 항목이 추가되기 전에 등록한 점포는 품종명 없음·미확인으로 남아 통계에서 빠집니다. 자동으로 채우지 않으니 확인 후 보관 처리하고 다시 등록해야 비교에 포함됩니다.",
      `한 점포는 옵션을 ${MAX_ACTIVE_OPTIONS_PER_STORE}개까지, 서로 다른 점포는 ${MAX_ACTIVE_STORES}곳까지 추적합니다. 같은 상품 주소·옵션명·중량은 같은 옵션으로 보아 중복 등록할 수 없고, 품종명·색상·크기 등 비교 조건만 정정하려면 기존 옵션을 보관한 뒤 다시 등록해야 합니다.`,
      "한 점포가 같은 비교 그룹에 옵션을 여러 개 두어도 표본은 하나만 반영합니다. 최근 7일 내 재고 있음·배송비 확인 관측 가운데 관측 시각이 가장 최근인 옵션(동률이면 등록 ID 순)을 고르며, 최저가 옵션을 고르지 않습니다. 품절·미확인·기록 없는 옵션이 같은 점포의 유효한 다른 옵션을 가리지 않습니다.",
      "전주 변화는 현재 표본으로 뽑힌 바로 그 옵션의 7일 전 기록과만 짝지어 비교하며, 현재와 7일 전 각각 최근 7일 내 기록이 있는 점포가 3곳 이상일 때만 산출합니다. 할인·쿠폰 조건은 메모를 함께 확인하세요.",
      `최근 패널 ${PANEL_READ_CAP}개(활성 옵션 최대 ${PANEL_ACTIVE_READ_CAP}개를 먼저 포함하고 나머지는 보관 이력)와 패널별 최신 관측 60개를 표시합니다. 품절·미확인은 가격 0원이나 변화 없음이 아닙니다.`],
  };
}
export async function mutateCompetitors(userId: string, input: CompetitorRequest, now = new Date()) {
  // The upstream API is gone: answer before any network call or database write, regardless of server credentials.
  if (input.action === "search") throw new BriefingError(410, SEARCH_RETIRED_MESSAGE);
  if (input.action === "addPanel") {
    const { productUrl, storeKey } = canonicalProductUrl(input.productUrl);
    const activeOptionKey = optionKeyOf({ productUrl, optionLabel: input.optionLabel, packageKg: input.packageKg });
    return prisma.$transaction(async tx => {
      // Legacy rows carry "legacy:<id>" keys, so duplicates are detected by recomputing the key from every active row of this store;
      // the unique (userId, activeOptionKey) index catches whatever a concurrent writer inserts in between.
      const siblings = await tx.competitorPanelEntry.findMany({ where: { userId, storeKey, archivedAt: null },
        select: { productUrl: true, optionLabel: true, packageKg: true } });
      if (siblings.some(row => optionKeyOf(row) === activeOptionKey))
        throw new BriefingError(409, "이미 고정 비교군에 있는 옵션입니다. 비교 조건을 바꾸려면 기존 옵션을 보관하고 다시 등록해 주세요.");
      if (siblings.length >= MAX_ACTIVE_OPTIONS_PER_STORE)
        throw new BriefingError(409, `한 점포의 추적 옵션은 ${MAX_ACTIVE_OPTIONS_PER_STORE}개까지입니다. 교체할 옵션을 먼저 보관 처리해 주세요.`);
      const stores = await tx.competitorPanelEntry.findMany({ where: { userId, archivedAt: null }, distinct: ["storeKey"], select: { storeKey: true } });
      if (siblings.length === 0 && stores.length >= MAX_ACTIVE_STORES)
        throw new BriefingError(409, `고정 비교군은 ${MAX_ACTIVE_STORES}곳까지입니다. 교체할 점포를 먼저 보관 처리해 주세요.`);
      const fields = { storeName: input.storeName, productName: input.productName, varietyGroup: input.varietyGroup, qualityGroup: input.qualityGroup,
        optionLabel: input.optionLabel, packageKg: input.packageKg, sizeGrade: input.sizeGrade, sizeCriteria: input.sizeCriteria,
        cultivarName: input.cultivarName, color: input.color, mixture: input.mixture, processing: input.processing };
      const entry = await tx.competitorPanelEntry.create({ data: { ...fields, userId, productUrl, storeKey, activeStoreKey: storeKey, activeOptionKey } })
        .catch((error: unknown) => { throw isUniqueViolation(error) ? new BriefingError(409, "같은 옵션이 동시에 등록되었습니다. 새로고침 후 확인해 주세요.") : error; });
      return { ok: true, id: entry.id };
    });
  }
  return prisma.$transaction(async tx => {
    const entry = await tx.competitorPanelEntry.findFirst({ where: { id: input.entryId, userId, archivedAt: null } });
    if (!entry) throw new BriefingError(404, "기록할 수 있는 비교군을 찾지 못했습니다.");
    if (input.action === "archive") {
      // Only the chosen option is archived; sibling options of the same store keep their active markers.
      await tx.competitorPanelEntry.update({ where: { id: entry.id }, data: { archivedAt: now, archiveReason: input.reason, activeStoreKey: null, activeOptionKey: null } });
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
