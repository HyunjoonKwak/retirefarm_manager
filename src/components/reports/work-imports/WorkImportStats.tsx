import type { WorkImportNormalized } from "@/lib/briefing/work-import-contracts";
import { formatWon, statusNames } from "./types";

/** Read-only view of the derived statistics. Every number here is a simple mean of public daily averages. */
export function WorkImportStats({ normalized }: { normalized: WorkImportNormalized | null }) {
  if (!normalized) return <p className="text-sm text-muted-foreground">정규화 정보가 없습니다.</p>;
  return <div className="space-y-3">
    <p className="text-sm"><span className="font-medium">검증 상태:</span> {statusNames[normalized.status] ?? normalized.status}</p>
    {normalized.reasons.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground">{normalized.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
    {normalized.status === "SUPPORTED" && <p className="text-xs text-muted-foreground">
      공개 일별 평균의 단순평균({normalized.statisticsVersion})입니다. 경매 원거래 가중평균과 정의가 달라 같은 추세선으로 잇지 않습니다.
      {normalized.smartstore && ` 스마트스토어 관측 ${normalized.smartstore.observationCount}건 · 패널 ${normalized.smartstore.panelEstablished ? "확정" : "미확정"}.`}
    </p>}
    {normalized.series.map(series => <div key={series.key} className="space-y-1">
      <h4 className="text-sm font-medium">{series.label}{series.packageKg ? ` ${series.packageKg}kg` : " · 포장 미확인"} · 관측 {series.dayCount}일</h4>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b text-left"><th className="py-1 pr-2">주(월~일)</th><th className="py-1 pr-2">일수</th>
          {normalized.gradeOrder.map(grade => <th key={grade} className="py-1 pr-2">{grade}</th>)}</tr></thead>
        <tbody>{series.weekly.map(week => <tr key={week.weekStart} className="border-b last:border-0">
          <td className="py-1 pr-2 whitespace-nowrap">{week.weekStart}~{week.weekEnd}</td><td className="py-1 pr-2">{week.dayCount}</td>
          {week.grades.map(grade => <td key={grade.grade} className="py-1 pr-2 whitespace-nowrap">
            {grade.mean === null ? "관측 없음" : `${formatWon(grade.mean)} (${grade.sampleCount}일)`}</td>)}
        </tr>)}</tbody>
      </table></div>
      {series.excluded.length > 0 && <p className="text-xs text-muted-foreground">0 이하 값 {series.excluded.length}건은 평균에서 제외했습니다: {series.excluded.map(item => `${item.date} ${item.grade}`).join(", ")}</p>}
    </div>)}
  </div>;
}
