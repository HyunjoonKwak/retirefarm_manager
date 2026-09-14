import { Button } from "@/components/ui/button";
import type { WorkImportListItem } from "./types";
import { formatDateTime, formatDay, statusNames } from "./types";

interface Props { items: WorkImportListItem[] | null; busy: boolean; onOpen: (id: string) => void }
function Row({ item, busy, onOpen }: { item: WorkImportListItem; busy: boolean; onOpen: (id: string) => void }) {
  const period = item.periodStart || item.periodEnd ? `${formatDay(item.periodStart) ?? "?"} ~ ${formatDay(item.periodEnd) ?? "?"}` : "기간 미지정";
  return <li className="flex flex-wrap items-center justify-between gap-2 py-2">
    <div className="space-y-0.5">
      <p className="text-sm font-medium">{item.title} <span className="text-muted-foreground">v{item.version}</span></p>
      <p className="text-xs text-muted-foreground">{period} · 보관 {formatDateTime(item.createdAt)} · {item.status ? statusNames[item.status] ?? item.status : "상태 없음"}</p>
      {item.correctionReason && <p className="text-xs text-muted-foreground">정정 사유: {item.correctionReason}</p>}
    </div>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpen(item.id)}>상세 보기</Button>
  </li>;
}
/** Originals and corrections are listed separately so a corrected report is never mistaken for a new one. */
export function WorkImportList({ items, busy, onOpen }: Props) {
  if (!items) return <p className="text-sm text-muted-foreground">보관 목록을 불러오는 중입니다.</p>;
  if (!items.length) return <p className="text-sm text-muted-foreground">아직 보관한 Work 보고서가 없습니다.</p>;
  const originals = items.filter(item => !item.parentId); const corrections = items.filter(item => item.parentId);
  return <div className="space-y-4">
    <section><h3 className="text-sm font-semibold">원본 보고서 {originals.length}건</h3>
      <ul className="divide-y">{originals.map(item => <Row key={item.id} item={item} busy={busy} onOpen={onOpen} />)}</ul></section>
    {corrections.length > 0 && <section><h3 className="text-sm font-semibold">정정 버전 {corrections.length}건</h3>
      <ul className="divide-y">{corrections.map(item => <Row key={item.id} item={item} busy={busy} onOpen={onOpen} />)}</ul></section>}
  </div>;
}
