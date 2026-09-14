import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WorkReportImports } from "@/components/reports/WorkReportImports";
import { normalizeWorkJson } from "@/lib/briefing/work-import";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const hostile = "<img src=x onerror=\"window.pwned=1\">\n# 제목\n| 특 | 31,000 |";
const supported = normalizeWorkJson({ schemaVersion: 1, gradeOrder: ["특", "상"], jujube: { packageKg: 3, rows: [["2026-09-01", 30000, 25000], ["2026-09-02", 32000, null]] } });
const original: Record<string, unknown> & { id: string; title: string; hasJson: boolean; status: string } = { id: "imp1", title: "9/14 주간 보고", periodStart: "2026-09-06T15:00:00.000Z", periodEnd: "2026-09-12T15:00:00.000Z", sourceUrl: "https://example.invalid/r",
  version: 1, parentId: null, correctionReason: null, contentHash: "a".repeat(64), createdAt: "2026-09-14T01:00:00.000Z", status: "SUPPORTED", hasJson: true, seriesCount: 1 };
const correction = { ...original, id: "imp2", version: 2, parentId: "imp1", correctionReason: "6거래일 평균으로 정정", createdAt: "2026-09-15T01:00:00.000Z", status: "MARKDOWN_ONLY", hasJson: false, seriesCount: 0 };
const detailOf = (item: typeof original, extra: object = {}) => ({ ...item, rawMarkdown: hostile, rawJson: item.hasJson ? "{\"schemaVersion\":1}" : null,
  normalized: item.status === "SUPPORTED" ? supported : { ...supported, status: "MARKDOWN_ONLY", series: [], reasons: ["JSON 없이 Markdown 원문만 보관합니다."] }, parent: null, corrections: [], ...extra });
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
/** Routes list, detail and POST like the real API; `posts` records every request body. */
function stubFetch(items: object[], post: (body: { action: string; input: Record<string, unknown> }) => unknown) {
  const fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") return post(JSON.parse(String(options.body)));
    if (url.startsWith("/api/briefings/imports/")) {
      const id = decodeURIComponent(url.split("/").pop()!);
      if (id === "imp1") return ok({ item: detailOf(original, { corrections: [{ id: "imp2", title: original.title, version: 2, correctionReason: correction.correctionReason, createdAt: correction.createdAt }] }) });
      if (id === "imp2") return ok({ item: detailOf(correction, { parent: { id: "imp1", title: original.title, version: 1, createdAt: original.createdAt } }) });
      return ok({ error: "보관된 보고서를 찾을 수 없습니다." }, 404);
    }
    return ok({ items });
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
const posts = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.filter(call => call[1]?.method === "POST").map(call => JSON.parse(call[1].body));
const previewBody = (input: Record<string, unknown>, extra: object = {}) => ok({ preview: { title: input.title, contentHash: "b".repeat(64), markdownChars: String(input.markdown).length,
  jsonChars: input.json ? String(input.json).length : 0, normalized: input.json ? supported : { ...supported, status: "MARKDOWN_ONLY", series: [], reasons: ["JSON 없이 Markdown 원문만 보관합니다."] }, duplicateOf: null, parent: null, ...extra } });

it("previews before saving, shows simple-mean statistics, and only imports after confirmation", async () => {
  const fetch = stubFetch([], ({ action, input }) => action === "preview" ? previewBody(input) : ok({ item: { ...original, id: "new" } }, 201));
  render(<WorkReportImports />);
  await screen.findByText("아직 보관한 Work 보고서가 없습니다.");
  expect(screen.getByRole("button", { name: "미리보기" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "9/14 주간 보고" } });
  fireEvent.change(screen.getByLabelText("출처 링크 (선택)"), { target: { value: "https://example.invalid/r" } });
  fireEvent.change(screen.getByLabelText("보고 기간 시작 (선택)"), { target: { value: "2026-09-07" } });
  fireEvent.change(screen.getByLabelText("Markdown 본문"), { target: { value: "# 보고서" } });
  fireEvent.change(screen.getByLabelText("관측 JSON (선택)"), { target: { value: "{\"schemaVersion\":1}" } });
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  const region = await screen.findByRole("region", { name: "가져오기 미리보기" });
  expect(within(region).getByText("구조 검증됨", { exact: false })).toBeInTheDocument();
  expect(within(region).getByText(/공개 일별 평균의 단순평균/)).toBeInTheDocument();
  expect(within(region).getByText("31,000원 (2일)")).toBeInTheDocument();
  expect(within(region).getByText("25,000원 (1일)")).toBeInTheDocument();
  expect(posts(fetch)).toEqual([{ action: "preview", input: { title: "9/14 주간 보고", markdown: "# 보고서", json: "{\"schemaVersion\":1}", sourceUrl: "https://example.invalid/r", periodStart: "2026-09-07" } }]);
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "9/14 주간 보고 v2" } });
  expect(screen.queryByRole("region", { name: "가져오기 미리보기" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  fireEvent.click(await screen.findByRole("button", { name: "이대로 보관" }));
  await waitFor(() => expect(posts(fetch).map(body => body.action)).toEqual(["preview", "preview", "import"]));
  await waitFor(() => expect(screen.getByLabelText("제목")).toHaveValue(""));
  expect(screen.queryByRole("region", { name: "가져오기 미리보기" })).not.toBeInTheDocument();
});
it("blocks saving a duplicate and surfaces server errors", async () => {
  const fetch = stubFetch([original], ({ action, input }) => action === "preview"
    ? previewBody(input, { duplicateOf: { id: "imp1", title: "9/14 주간 보고", createdAt: "2026-09-14T01:00:00.000Z" } }) : ok({ error: "같은 내용의 보고서가 이미 보관되어 있습니다." }, 409));
  render(<WorkReportImports />);
  await screen.findByText("원본 보고서 1건");
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "중복" } });
  fireEvent.change(screen.getByLabelText("Markdown 본문"), { target: { value: "# 같은 본문" } });
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  await screen.findByText(/이미 보관되어 있어 저장할 수 없습니다/);
  expect(screen.getByRole("button", { name: "이대로 보관" })).toBeDisabled();
  expect(posts(fetch).map(body => body.action)).toEqual(["preview"]);
});
it("loads a file into the textarea without uploading it and refuses oversized files", async () => {
  stubFetch([], () => ok({}));
  render(<WorkReportImports />);
  await screen.findByText("아직 보관한 Work 보고서가 없습니다.");
  const file = new File(["{\"schemaVersion\":1,\"gradeOrder\":[\"특\"]}"], "obs.json", { type: "application/json" });
  fireEvent.change(screen.getByLabelText("JSON 파일"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByLabelText("관측 JSON (선택)")).toHaveValue("{\"schemaVersion\":1,\"gradeOrder\":[\"특\"]}"));
  const huge = new File([new Uint8Array(1024 * 1024 + 1)], "big.md", { type: "text/markdown" });
  fireEvent.change(screen.getByLabelText("Markdown 파일"), { target: { files: [huge] } });
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("big.md");
  expect(screen.getByLabelText("Markdown 본문")).toHaveValue("");
});
it("lists originals and corrections separately, opens detail with raw text rendered as text, and starts a correction", async () => {
  const fetch = stubFetch([correction, original], () => ok({}));
  render(<WorkReportImports />);
  await screen.findByText("원본 보고서 1건");
  expect(screen.getByText("정정 버전 1건")).toBeInTheDocument();
  expect(screen.getByText("정정 사유: 6거래일 평균으로 정정")).toBeInTheDocument();
  expect(screen.getAllByText(/보관 2026\. 9\. 1[45]\./)).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "상세 보기" })[0]);
  const detail = await screen.findByRole("region", { name: "보관 보고서 상세" });
  expect(within(detail).getByTestId("raw-markdown")).toHaveTextContent("<img src=x onerror=\"window.pwned=1\">");
  expect(detail.querySelector("img")).toBeNull();
  expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  expect(within(detail).getByTestId("raw-json")).toHaveTextContent("{\"schemaVersion\":1}");
  expect(within(detail).getByRole("link", { name: "https://example.invalid/r" })).toHaveAttribute("rel", "noopener noreferrer nofollow");
  expect(within(detail).getByText("이 보고서의 정정 버전")).toBeInTheDocument();
  fireEvent.click(within(detail).getByRole("button", { name: /v2 · / }));
  await within(await screen.findByRole("region", { name: "보관 보고서 상세" })).findByText(/정정 사유: 6거래일 평균으로 정정 · 원본:/);
  expect(screen.getByRole("heading", { name: /9\/14 주간 보고 v2/ })).toBeInTheDocument();
  expect(screen.queryByTestId("raw-json")).toBeNull();
  expect(fetch.mock.calls.map(call => String(call[0]))).toContain("/api/briefings/imports/imp2");
  fireEvent.click(screen.getByRole("button", { name: "이 보고서 정정본 올리기" }));
  expect(screen.queryByRole("region", { name: "보관 보고서 상세" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("정정할 원본 (선택)")).toHaveValue("imp2");
  expect(screen.getByLabelText("제목")).toHaveValue("9/14 주간 보고");
  expect(screen.getByLabelText("보고 기간 시작 (선택)")).toHaveValue("2026-09-07");
  fireEvent.change(screen.getByLabelText("Markdown 본문"), { target: { value: "# v3" } });
  expect(screen.getByRole("button", { name: "미리보기" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("정정 사유"), { target: { value: "재정정" } });
  expect(screen.getByRole("button", { name: "미리보기" })).toBeEnabled();
});
