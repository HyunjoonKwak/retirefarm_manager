import { Button } from "@/components/ui/button";
import type { WorkImportPreview as Preview } from "./types";
import { formatDateTime } from "./types";
import { WorkImportStats } from "./WorkImportStats";

interface Props { preview: Preview; busy: boolean; onConfirm: () => void; onCancel: () => void }
/** Shows what will be saved. Nothing is written until the user confirms. */
export function WorkImportPreview({ preview, busy, onConfirm, onCancel }: Props) {
  return <div className="rounded-lg border p-4 space-y-3" role="region" aria-label="가져오기 미리보기">
    <h3 className="font-semibold">가져오기 미리보기</h3>
    <p className="text-sm">{preview.title} · Markdown {preview.markdownChars.toLocaleString("ko-KR")}자{preview.jsonChars ? ` · JSON ${preview.jsonChars.toLocaleString("ko-KR")}자` : " · JSON 없음"}</p>
    <p className="text-xs text-muted-foreground break-all">내용 해시 {preview.contentHash}</p>
    {preview.parent && <p className="text-sm">정정 대상: {preview.parent.title} (v{preview.parent.version}) → 새 버전 v{preview.parent.version + 1}로 저장됩니다. 원본은 변경되지 않습니다.</p>}
    {preview.duplicateOf && <p className="text-sm text-destructive">같은 내용이 {formatDateTime(preview.duplicateOf.createdAt)}에 &ldquo;{preview.duplicateOf.title}&rdquo;으로 이미 보관되어 있어 저장할 수 없습니다.</p>}
    <WorkImportStats normalized={preview.normalized} />
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !!preview.duplicateOf} onClick={onConfirm}>이대로 보관</Button>
      <Button variant="outline" disabled={busy} onClick={onCancel}>미리보기 닫기</Button>
    </div>
  </div>;
}
