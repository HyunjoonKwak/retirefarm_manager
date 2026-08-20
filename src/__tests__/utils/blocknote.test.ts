import { describe, it, expect } from "vitest";
import {
  blockNoteToPlainText,
  blockNoteContentSchema,
} from "@/lib/utils/blocknote";

const doc = JSON.stringify([
  {
    id: "1",
    type: "heading",
    content: [{ type: "text", text: "오전 작업", styles: {} }],
    children: [],
  },
  {
    id: "2",
    type: "paragraph",
    content: [
      { type: "text", text: "토마토 ", styles: {} },
      { type: "text", text: "순치기", styles: { bold: true } },
    ],
    children: [
      {
        id: "2-1",
        type: "bulletListItem",
        content: [{ type: "text", text: "1동 완료", styles: {} }],
        children: [],
      },
    ],
  },
]);

describe("blockNoteToPlainText", () => {
  it("블록·중첩 텍스트를 평문으로 합친다", () => {
    expect(blockNoteToPlainText(doc)).toBe("오전 작업 토마토 순치기 1동 완료");
  });

  it("최대 길이를 넘으면 자르고 말줄임표를 붙인다", () => {
    const text = blockNoteToPlainText(doc, 5);
    expect(text).toBe("오전 작업…");
  });

  it("빈 문서·잘못된 JSON은 빈 문자열", () => {
    expect(blockNoteToPlainText(null)).toBe("");
    expect(blockNoteToPlainText("")).toBe("");
    expect(blockNoteToPlainText("{not json")).toBe("");
    expect(blockNoteToPlainText(JSON.stringify({ type: "text" }))).toBe("");
    expect(
      blockNoteToPlainText(
        JSON.stringify([{ type: "paragraph", content: [], children: [] }])
      )
    ).toBe("");
  });

  it("표(rows/cells) 안의 텍스트도 수집한다", () => {
    const table = JSON.stringify([
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [
                [{ type: "text", text: "품목", styles: {} }],
                [{ type: "text", text: "수량", styles: {} }],
              ],
            },
          ],
        },
        children: [],
      },
    ]);
    expect(blockNoteToPlainText(table)).toBe("품목 수량");
  });
});

describe("blockNoteContentSchema", () => {
  it("최상위 배열 JSON만 허용한다", () => {
    expect(blockNoteContentSchema.safeParse(doc).success).toBe(true);
    expect(blockNoteContentSchema.safeParse("[]").success).toBe(true);
    expect(blockNoteContentSchema.safeParse("{}").success).toBe(false);
    expect(blockNoteContentSchema.safeParse("plain text").success).toBe(false);
  });

  it("200KB를 넘으면 거부한다", () => {
    const huge = JSON.stringify([
      { type: "paragraph", content: [{ type: "text", text: "가".repeat(200_001) }] },
    ]);
    expect(blockNoteContentSchema.safeParse(huge).success).toBe(false);
  });
});
