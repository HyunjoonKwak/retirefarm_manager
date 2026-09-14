import type { BriefingSnapshot } from "@/lib/briefing/contracts";

const periods = { current: "보고 주간", previous: "전주", fourWeeks: "직전 네 주" } as const;
const reasons = { NO_BASELINE: "비교 거래 없음", LOW_SAMPLE: "표본 부족", UNVERIFIED_COLLECTION: "수집 확인 부족", COMPARABLE: "비교 가능" };
const issueNames = { UNKNOWN: "확인 기록 없음", PARTIAL: "부분 수집", FAILED: "수집 실패" };
const number = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const day = (value: string) => new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

export function BriefingPriceAnalysis({ snapshot }: { snapshot: BriefingSnapshot }) {
  const analysis = snapshot.analysis;
  if (!analysis) return <p className="text-xs text-muted-foreground">이전 버전 초안에는 수집 확인·기간 비교가 포함되지 않았습니다.</p>;
  const metrics = new Map(snapshot.metrics.map(metric => [metric.id, metric]));
  return <section className="space-y-3" aria-label="시세 수집 확인과 기간 비교">
    <h4 className="font-medium">수집 확인과 기간 비교</h4>
    <p className="text-sm text-muted-foreground">법인·날짜별 수집 기록을 확인합니다. 기록이 없다고 휴장이나 무거래로 판단하지 않습니다.</p>
    <div className="grid gap-2 sm:grid-cols-3">
      {(Object.keys(periods) as Array<keyof typeof periods>).map(key => {
        const coverage = analysis.coverage[key];
        return <div key={key} className="rounded border p-3 text-sm space-y-1">
          <p className="font-medium">{periods[key]}</p>
          <p className="text-xs">{day(coverage.periodStart)} ~ {day(new Date(new Date(coverage.periodEnd).getTime() - 1).toISOString())}</p>
          <p>완료 기록 {coverage.verifiedSlots}/{coverage.totalSlots} · 빈 응답 {coverage.emptySlots}</p>
          <p>부분 {coverage.partialSlots} · 실패 {coverage.failedSlots} · 미확인 {coverage.unknownSlots}</p>
          {coverage.issues.length > 0 && <details><summary className="cursor-pointer">확인이 필요한 날짜·법인</summary>
            <ul className="mt-2 max-h-36 overflow-auto text-xs space-y-1">{coverage.issues.map(issue => <li key={`${issue.date}-${issue.corporationCode}`}>
              {issue.date} · {issue.corporationCode} · {issueNames[issue.status]}
            </li>)}</ul>
          </details>}
        </div>;
      })}
    </div>
    <p className="text-xs text-muted-foreground">동일 조건의 수량 가중평균입니다. 양쪽 기간의 수집 완료 기록과 각각 거래 세 건·관측 이틀 이상이 확인돼야 등락률을 표시합니다. 직전 네 주는 전체 거래를 가중한 기준가입니다. 공개 일평균과 다르며 수집 로그만으로 원자료의 완전한 보존을 보증하지 않습니다.</p>
    {analysis.comparisons.length === 0 ? <p className="text-sm">보고 주간에 비교할 유효 거래가 없습니다.</p> :
      <div className="max-h-96 overflow-auto"><table className="w-full min-w-[640px] text-sm">
        <caption className="text-left pb-2">이번 주 관측 조건별 비교 · 동일 거래단위 · 반올림 전 값으로 등락률 계산</caption>
        <thead><tr><th className="text-left">비교 조건</th><th className="text-right">보고 주간</th><th className="text-right">전주 기준</th><th className="text-right">직전 네 주 기준</th></tr></thead>
        <tbody>{analysis.comparisons.map(row => {
          const metric = metrics.get(row.metricId);
          return <tr key={row.metricId} className="border-t align-top">
            <td className="py-2 pr-3">{metric?.label ?? "비교 조건 확인 필요"}</td>
            <td className="py-2 px-2 text-right tabular-nums">{metric ? `${number(metric.value)} ${metric.unit}` : "—"}<p className="text-xs text-muted-foreground">{row.currentTrades}건 · {row.currentDays}일</p></td>
            {([row.previous, row.fourWeeks]).map((comparison, index) => <td key={index} className="py-2 px-2 text-right tabular-nums">
              {comparison.price === null ? "—" : `${number(comparison.price)} ${metric?.unit ?? ""}`}
              <p className="text-xs">{comparison.status === "COMPARABLE" && comparison.changePct !== null
                ? `대비 ${comparison.changePct > 0 ? "+" : ""}${number(comparison.changePct)}%` : `등락률 보류 · ${reasons[comparison.status]}`}</p>
              <p className="text-xs text-muted-foreground">{comparison.tradeCount}건 · {comparison.observedDays}일</p>
            </td>)}
          </tr>;
        })}</tbody>
      </table></div>}
  </section>;
}
