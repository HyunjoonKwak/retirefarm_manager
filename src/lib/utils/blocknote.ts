/**
 * BlockNote 문서 JSON 공용 유틸 (운영일지 본문)
 *
 * 문서는 FarmingLog.content에 JSON 문자열로 저장한다.
 * 목록 카드·HWP 출력 등 에디터가 필요 없는 곳은 평문 추출을 쓴다.
 */

import { z } from "zod";

/** 저장 가능한 BlockNote 문서: 최상위가 배열인 JSON, 크기 상한 */
export const blockNoteContentSchema = z
  .string()
  .max(200_000, "본문이 너무 깁니다.")
  .refine((value) => {
    try {
      return Array.isArray(JSON.parse(value));
    } catch {
      return false;
    }
  }, "본문 형식이 올바르지 않습니다.");

/**
 * BlockNote 문서 JSON → 평문. 블록 구조를 재귀 탐색해
 * {type:"text", text:"..."} 노드의 텍스트를 모은다 (표·중첩 블록 포함).
 */
export function blockNoteToPlainText(
  json: string | null | undefined,
  maxLength = 500
): string {
  if (!json) return "";

  let document: unknown;
  try {
    document = JSON.parse(json);
  } catch {
    return "";
  }
  if (!Array.isArray(document)) return "";

  const parts: string[] = [];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      parts.push(record.text);
      return;
    }
    // block: content(인라인)·children(중첩)·rows(표) 등 컨테이너 키만 탐색
    for (const key of ["content", "children", "rows", "cells"]) {
      if (key in record) walk(record[key]);
    }
  }

  walk(document);

  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
