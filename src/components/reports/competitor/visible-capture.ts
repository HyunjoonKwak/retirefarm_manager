import { z } from "zod";
import { isSmartstoreProductUrl } from "./competitor-utils";

export const MAX_CAPTURE_CHARS = 40000;
export const MAX_CAPTURE_FILE_BYTES = 160000;
const MAX_AGE_MS = 24 * 3600000;
const schema = z.object({
  schemaVersion: z.literal("retirefarm-visible-product-v1"),
  productUrl: z.string().max(2000), capturedAt: z.string().datetime({ offset: true }),
  title: z.string().max(200), text: z.string().min(1).max(30000),
  method: z.enum(["selection", "product-region"]),
}).strict();
export type VisibleCapture = z.infer<typeof schema>;
export type CaptureInput = { ok: true; text: string; capture?: VisibleCapture } | { ok: false; error: string };

function canonical(value: string): string | null {
  if (!isSmartstoreProductUrl(value)) return null;
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/$/, "").toLowerCase()}`;
}

/** Treat extension JSON as untrusted input; it can prefill only the exact fixed product. */
export function readCaptureInput(input: string, productUrl: string, now = new Date()): CaptureInput {
  if (input.length > MAX_CAPTURE_CHARS) return { ok: false, error: "가져오기 내용이 너무 큽니다. 상품 가격 영역만 다시 가져오세요." };
  const trimmed = input.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return input.length <= 30000 ? { ok: true, text: input } : { ok: false, error: "상품 화면 텍스트는 30,000자까지 읽을 수 있습니다." };
  }
  let value: unknown;
  try { value = JSON.parse(trimmed); } catch { return { ok: false, error: "확장 프로그램 JSON이 완전하지 않습니다. 다시 복사하거나 파일로 가져오세요." }; }
  const result = schema.safeParse(value);
  if (!result.success) return { ok: false, error: "지원하는 상품 수집 파일 형식이 아닙니다. 최신 확장 프로그램에서 다시 가져오세요." };
  const capture = result.data;
  const capturedUrl = canonical(capture.productUrl);
  if (!capturedUrl || capturedUrl !== canonical(productUrl)) return { ok: false, error: "다른 상품에서 가져온 자료입니다. 이 패널의 상품 페이지에서 다시 수집하세요." };
  const age = now.getTime() - Date.parse(capture.capturedAt);
  if (age < 0 || age > MAX_AGE_MS) return { ok: false, error: "수집 시각이 미래이거나 24시간이 지났습니다. 현재 상품 페이지에서 다시 가져오세요." };
  return { ok: true, text: capture.text, capture: { ...capture, productUrl: capturedUrl } };
}
