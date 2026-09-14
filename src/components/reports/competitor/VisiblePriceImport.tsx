"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseVisiblePage, VISIBLE_PAGE_PARSER_VERSION } from "./parse-visible-page";
import { readCaptureInput, MAX_CAPTURE_CHARS, MAX_CAPTURE_FILE_BYTES, type VisibleCapture } from "./visible-capture";
import { won, dateTime } from "./competitor-utils";

type Parsed = ReturnType<typeof parseVisiblePage>;
export interface VisiblePriceDraft { price: string; shippingFee: string; availability: Parsed["availability"]; notes: string; capturedAt?: string }
const normalizeOption = (value: string) => value.trim().replace(/\s+/g, " ");

/** Extraction fills a draft only; the normal authenticated record form owns persistence. */
export function VisiblePriceImport({ entryId, optionLabel, productUrl, busy, onApply }: {
  entryId: string; optionLabel: string; productUrl: string; busy: boolean; onApply: (draft: VisiblePriceDraft) => void;
}) {
  const [text, setText] = useState("");
  const [capture, setCapture] = useState<VisibleCapture | undefined>();
  const [error, setError] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [applied, setApplied] = useState(false);
  const matches = normalizeOption(selectedOption) === normalizeOption(optionLabel);
  const id = (name: string) => `import-${entryId}-${name}`;
  const extract = () => {
    const input = readCaptureInput(text, productUrl);
    if (!input.ok) { setError(input.error); setParsed(null); setCapture(undefined); return; }
    setError(""); setCapture(input.capture);
    const result = parseVisiblePage(input.text);
    setParsed(result); setSelectedOption(result.optionLabel ?? ""); setConfirmed(false); setApplied(false);
  };
  return <details className="rounded-md border p-3 text-sm space-y-2">
    <summary className="cursor-pointer font-medium">상품 화면에서 가격 가져오기</summary>
    <p>상품 페이지에서 옵션 하나·수량 1을 선택한 뒤 선택 옵션, 총 금액, 배송비 영역을 복사해 붙여넣으세요. 이 내용은 브라우저에서만 분석합니다.</p>
    <p>확장 프로그램에서 복사한 상품 자료도 붙여넣을 수 있습니다. 파일을 선택해도 아직 저장되지 않습니다.</p>
    <Label htmlFor={id("file")}>확장 프로그램 수집 파일 (.json)</Label>
    <Input id={id("file")} type="file" accept=".json,application/json" disabled={busy || readingFile} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file) return;
      setParsed(null); setCapture(undefined); setConfirmed(false); setApplied(false); setText(""); setError("");
      if (file.size > MAX_CAPTURE_FILE_BYTES) { setError("수집 파일이 너무 큽니다. 가격 영역만 다시 가져오세요."); return; }
      setReadingFile(true);
      try {
        const content = await file.text();
        if (content.length > MAX_CAPTURE_CHARS) { setError("가져오기 내용이 너무 큽니다. 가격 영역만 다시 가져오세요."); return; }
        setText(content);
      } catch { setError("파일을 읽지 못했습니다. JSON 내용을 복사해 붙여넣어 주세요."); }
      finally { setReadingFile(false); }
    }} />
    <Label htmlFor={id("text")}>상품 화면 텍스트</Label>
    <Textarea id={id("text")} value={text} rows={5} maxLength={MAX_CAPTURE_CHARS} disabled={busy || readingFile} placeholder={"선택 옵션: 중과 2kg\n총 금액 18,500원\n무료배송"}
      onChange={e => { setText(e.target.value); setParsed(null); setCapture(undefined); setError(""); setConfirmed(false); setApplied(false); }} />
    <Button type="button" variant="outline" size="sm" disabled={busy || readingFile || !text.trim()} onClick={extract}>가격 읽기</Button>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {parsed && <div className="space-y-2">
      {capture && <p>수집 시각 {dateTime(capture.capturedAt)} · {capture.method === "selection" ? "선택한 화면 영역" : "상품 가격 영역"} · 상품 주소 일치 확인</p>}
      <p>읽은 상품가 {won(parsed.price)} · 배송비 {won(parsed.shippingFee)} · 재고 {parsed.availability === "OUT_OF_STOCK" ? "품절 표시 확인" : "직접 확인 필요"}</p>
      {parsed.hints.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{parsed.hints.map((hint, i) => <li key={i}>{hint}</li>)}</ul>}
      <p>고정 비교 옵션: <strong>{optionLabel}</strong></p>
      <Label htmlFor={id("option")}>지금 선택한 옵션명</Label>
      <Input id={id("option")} value={selectedOption} maxLength={200} disabled={busy}
        onChange={e => { setSelectedOption(e.target.value); setConfirmed(false); setApplied(false); }} />
      {!matches && <p role="alert" className="text-destructive">선택 옵션이 고정 비교 옵션과 일치해야 합니다. 상품 페이지에서 같은 옵션을 선택하고 표기를 확인해 주세요.</p>}
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={confirmed} disabled={busy || !matches} onChange={e => setConfirmed(e.target.checked)} />
        선택 옵션·수량 1과 상품가·배송비를 확인했습니다. 쿠폰·포인트와 배송비가 상품가에 합산되지 않았습니다.
      </label>
      <Button type="button" size="sm" disabled={busy || !matches || !confirmed} onClick={() => {
        if (capture) {
          const checked = readCaptureInput(text, productUrl);
          if (!checked.ok) { setError(checked.error); return; }
        }
        onApply({ ...(capture ? { capturedAt: capture.capturedAt } : {}), price: parsed.price === null ? "" : String(parsed.price), shippingFee: parsed.shippingFee === null ? "" : String(parsed.shippingFee),
          availability: parsed.availability, notes: `화면 텍스트 확인 (${VISIBLE_PAGE_PARSER_VERSION}) · ${capture ? `수집 ${capture.capturedAt} ${capture.productUrl} · ` : ""}옵션: ${selectedOption.trim()} · 추출 상품가 ${won(parsed.price)} · 추출 배송비 ${won(parsed.shippingFee)} · 수량 1, 조건부 쿠폰 제외 확인. ${parsed.hints.join(" ")}`.slice(0, 1000) });
        setApplied(true);
      }}>기록 양식에 채우기</Button>
      {applied && <p role="status">아래 기록 양식에 채웠습니다. 재고와 미확인 값을 확인한 뒤 ‘관측 기록’을 눌러 저장하세요.</p>}
    </div>}
  </details>;
}
