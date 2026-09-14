import { Button } from "@/components/ui/button";
import type { WorkImportDetail as Detail } from "./types";
import { formatDateTime, formatDay } from "./types";
import { WorkImportStats } from "./WorkImportStats";

interface Props { item: Detail; busy: boolean; onClose: () => void; onOpen: (id: string) => void; onCorrect: (item: Detail) => void }
/** Raw text is rendered as text nodes inside <pre>; Markdown and JSON are never parsed into HTML here. */
export function WorkImportDetail({ item, busy, onClose, onOpen, onCorrect }: Props) {
  const period = item.periodStart || item.periodEnd ? `${formatDay(item.periodStart) ?? "?"} ~ ${formatDay(item.periodEnd) ?? "?"}` : "기간 미지정";
  return <div className="rounded-lg border p-4 space-y-4" role="region" aria-label="보관 보고서 상세">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="space-y-1">
        <h3 className="font-semibold">{item.title} <span className="text-muted-foreground">v{item.version}</span></h3>
        <p className="text-xs text-muted-foreground">{period} · 보관 {formatDateTime(item.createdAt)}</p>
        {item.sourceUrl && <p className="text-xs break-all">출처 링크: <a className="underline" href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{item.sourceUrl}</a></p>}
        <p className="text-xs text-muted-foreground break-all">내용 해시 {item.contentHash}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onCorrect(item)}>이 보고서 정정본 올리기</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onClose}>닫기</Button>
      </div>
    </div>
    {item.parent && <p className="text-sm">정정 사유: {item.correctionReason ?? "기록 없음"} · 원본:{" "}
      <button type="button" className="underline" disabled={busy} onClick={() => onOpen(item.parent!.id)}>{item.parent.title} v{item.parent.version} ({formatDateTime(item.parent.createdAt)})</button></p>}
    {item.corrections.length > 0 && <div className="text-sm"><p className="font-medium">이 보고서의 정정 버전</p>
      <ul className="list-disc pl-5">{item.corrections.map(correction => <li key={correction.id}>
        <button type="button" className="underline" disabled={busy} onClick={() => onOpen(correction.id)}>v{correction.version} · {formatDateTime(correction.createdAt)}</button>
        {correction.correctionReason && <span className="text-muted-foreground"> · {correction.correctionReason}</span>}</li>)}</ul></div>}
    <WorkImportStats normalized={item.normalized} />
    <details open><summary className="cursor-pointer text-sm font-medium">Markdown 원문</summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs" data-testid="raw-markdown">{item.rawMarkdown}</pre></details>
    {item.rawJson !== null && <details><summary className="cursor-pointer text-sm font-medium">JSON 원문</summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs" data-testid="raw-json">{item.rawJson}</pre></details>}
  </div>;
}
