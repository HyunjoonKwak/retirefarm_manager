import type { BriefingSnapshot } from "@/lib/briefing/contracts";
export function BriefingSupplementalSources({ snapshot }: { snapshot: BriefingSnapshot }) {
  const sources = snapshot.sources.filter(source => source.id === "competitors" || source.id.startsWith("work-"));
  return <div className="space-y-3">
    {sources.map(source => {
      const metrics = snapshot.metrics.filter(metric => metric.sourceId === source.id);
      return <details key={source.id} className="rounded-md border p-3" open={metrics.length > 0}>
        <summary className="cursor-pointer text-sm font-medium">{source.title} · {source.status === "AVAILABLE" ? "참고 자료 반영" : "비교 자료 부족"}</summary>
        <p className="mt-2 text-xs text-muted-foreground">{source.note}</p>
        {source.url && <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">원문 출처</a>}
        {metrics.length > 0 && <div className="mt-2 overflow-auto"><table className="w-full text-sm">
          <caption className="sr-only">경락 시세와 별도로 읽는 참고 자료</caption>
          <thead><tr><th className="text-left">지표</th><th className="text-right">값</th></tr></thead>
          <tbody>{metrics.map(metric => <tr key={metric.id} className="border-t"><td className="py-2 pr-3">{metric.label}</td><td className="whitespace-nowrap text-right">{metric.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} {metric.unit}</td></tr>)}</tbody>
        </table></div>}
      </details>;
    })}
  </div>;
}
