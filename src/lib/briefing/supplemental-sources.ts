import prisma from "@/lib/prisma";
import type { BriefingSnapshot } from "./contracts";
import { competitorOverview } from "./competitors";
import type { WorkImportNormalized } from "./work-import-contracts";

/** Bounded, immutable numeric context. Raw imported prose is never treated as model instructions. */
export async function supplementalSources(userId: string, start: Date, end: Date, now: Date) {
  const [competitors, imported] = await Promise.all([
    competitorOverview(userId, now),
    prisma.workReportImport.findFirst({ where: { userId, createdAt: { lte: now } }, orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true, title: true, sourceUrl: true, normalized: true, version: true, createdAt: true } }),
  ]);
  const sources: BriefingSnapshot["sources"] = [];
  const metrics: BriefingSnapshot["metrics"] = [];
  const limitations: string[] = [];
  const validGroups = competitors.groups.filter(g => g.medianDeliveredPrice !== null);
  sources.push({ id: "competitors", title: "직접 검증한 고정 경쟁점 옵션 가격", url: null,
    status: validGroups.length ? "AVAILABLE" : "NOT_COLLECTED",
    note: `보고서 생성 시각 기준. 지난 보고 주간과 별개인 최신 참고 자료입니다. 활성 점포 ${competitors.activeCount}/30곳${competitors.activeOptionCount === undefined ? "" : `, 추적 옵션 ${competitors.activeOptionCount}개`}. 최근 7일 내 재고·배송비와 품종명·색상·가공·크기 기준·중량을 확인한 동일 단일 품종 상품군에서 3곳 이상일 때 배송 포함 중앙가격을 산출합니다. 같은 점포는 그룹당 최신 유효 옵션 한 건만 반영하며 전주는 그 옵션의 이력으로 비교합니다. API 검색 최저가는 이 지표에 포함하지 않습니다.` });
  validGroups.slice(0,30).forEach((g,index) => {
    metrics.push({ id: `competitor-median-${index}`, label: `${g.label} 현재 배송 포함 중앙가격`, value: g.medianDeliveredPrice!, unit: "원/확인 옵션", sourceId: "competitors" });
    metrics.push({ id: `competitor-count-${index}`, label: `${g.label} 비교 점포`, value: g.count, unit: "곳", sourceId: "competitors" });
    if (g.previousWeekChangePct !== null) metrics.push({ id: `competitor-change-${index}`, label: `${g.label} 동일 고정 옵션의 전주 대비 중앙가격 변화`, value: g.previousWeekChangePct, unit: "%", sourceId: "competitors" });
  });
  limitations.push("경쟁점 최신 참고 가격은 사용자가 확인한 옵션·일반 배송비 기준이며 지역 추가운임·개별 쿠폰 조건을 보장하지 않습니다. 품종명·색상·가공·크기 기준 미확인 및 혼합 자료는 대표 가격에서 제외하며, 브라우저 검색 순서는 비광고 순위가 아닙니다.");
  if (imported) {
    let normalized: WorkImportNormalized|null = null;
    try { normalized = imported.normalized ? JSON.parse(imported.normalized) as WorkImportNormalized : null; } catch { /* raw-only */ }
    const sourceId = `work-${imported.id}`;
    const weekStart = new Date(start.getTime()+9*3600000).toISOString().slice(0,10);
    const weekEnd = new Date(end.getTime()+9*3600000-86400000).toISOString().slice(0,10);
    if (normalized?.status === "SUPPORTED" && normalized.statisticsVersion === "public-daily-simple-mean-v1") {
      for (const series of normalized.series) {
        if (series.packageKg === null) continue;
        for (const week of series.weekly.filter(w => w.weekStart === weekStart && w.weekEnd === weekEnd)) {
          for (const grade of week.grades) {
            if (grade.mean === null || grade.dayCount < 2 || !Number.isFinite(grade.mean)) continue;
            metrics.push({ id: `work-mean-${metrics.length}`, label: `${series.label} ${grade.grade} ${week.weekStart}~${week.weekEnd} 공개 일별 평균의 단순평균 (${grade.dayCount}일)`,
              value: grade.mean, unit: `원/${series.packageKg}kg`, sourceId });
          }
        }
      }
    }
    const included = metrics.some(m => m.sourceId === sourceId);
    sources.push({ id: sourceId, title: `Work 원본: ${imported.title}`.slice(0,200), url: imported.sourceUrl,
      status: included ? "AVAILABLE" : "NOT_COLLECTED",
      note: `가져오기 ID ${imported.id}, 버전 ${imported.version}, 저장 ${imported.createdAt.toISOString()}. 종료일이 가장 최근인 보관본 한 건(동일 종료일은 최신 저장본)을 참조합니다. ${included ? "보고 주간에 해당하는 공개 일평균의 단순평균입니다. 경락 거래량 가중평균과 합치거나 직접 등락 비교하지 않습니다." : "보고 주간의 지원되는 숫자 자료가 없어 원문 보관만 완료했습니다. 원문의 정책·기상 문장은 현재 검증된 사실로 재사용하지 않습니다."}` });
    limitations.push("Work 원문과 정정 내용은 원본 보관함에서 확인합니다. 가져온 가격은 공개 일별 평균의 단순평균이며 수집 법인별 경락 통계와 다른 모집단입니다.");
  }
  return { sources, metrics, limitations };
}
