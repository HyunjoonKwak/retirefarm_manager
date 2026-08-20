"use client";

/**
 * 운영일지 본문 에디터 (Asset Hub §6 — BlockNote, MPL-2.0 의존성)
 *
 * FarmingLog.content(BlockNote 문서 JSON)를 편집·표시한다.
 * SSR 불가 컴포넌트 — 반드시 next/dynamic({ ssr: false })로 불러올 것.
 */

import { useTheme } from "next-themes";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { ko } from "@blocknote/core/locales";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/shadcn/style.css";

interface FarmingLogEditorProps {
  /** BlockNote 문서 JSON 문자열 (null이면 빈 문서) */
  initialContent?: string | null;
  onChange?: (json: string) => void;
  editable?: boolean;
}

function parseBlocks(json: string | null | undefined): PartialBlock[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length > 0
      ? (parsed as PartialBlock[])
      : undefined;
  } catch {
    return undefined;
  }
}

export default function FarmingLogEditor({
  initialContent,
  onChange,
  editable = true,
}: FarmingLogEditorProps) {
  const { resolvedTheme } = useTheme();

  const editor = useCreateBlockNote({
    dictionary: {
      ...ko,
      placeholders: {
        ...ko.placeholders,
        emptyDocument: "오늘의 작업, 관찰 내용을 자유롭게 기록하세요…",
      },
    },
    initialContent: parseBlocks(initialContent),
  });

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      onChange={() => onChange?.(JSON.stringify(editor.document))}
      className={editable ? "min-h-40 rounded-md border" : ""}
    />
  );
}
