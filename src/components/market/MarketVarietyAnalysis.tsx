"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { VarietyPriceSummary } from "@/lib/market-analysis";
import { STAT_LABELS, buildAnalysisUrl } from "./marketPriceTypes";

interface AnalysisResult {
  summaries: VarietyPriceSummary[]; excludedCount: number; analyzedCount: number; truncated: boolean;
}
const money = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

export function MarketVarietyAnalysis({ productName, origin, unit, grade, varieties, days, onDaysChange }: {
  productName: string; origin: string | null; unit: string | null; grade: string | null;
  varieties: string[]; days: string;
  onDaysChange: (days: string) => void;
}) {
  const [state, setState] = useState<{ key: string; data?: AnalysisResult; error?: string }>({ key: "" });
  const [perKg, setPerKg] = useState(false);
  const [retry, setRetry] = useState(0);
  // 선택하지 않은 조건은 요청에 넣지 않는다. 늦게 도착한 이전 조건의 응답은 키로 걸러낸다.
  const url = buildAnalysisUrl(productName, days, { origin, unit, grade, varieties });
  const key = JSON.stringify([url, retry]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "분석 조회 실패");
        if (!controller.signal.aborted) setState({ key, data });
      }).catch(error => {
        if (!controller.signal.aborted) setState({ key, error: error.message });
      });
    return () => controller.abort();
  }, [url, key]);
  const current = state.key === key ? state : null;
  const summaries = current?.data?.summaries ?? [];

  return <Card>
    <CardHeader>
      <CardTitle className="text-base">품종·등급별 가격 비교</CardTitle>
      <p className="text-sm text-muted-foreground">
        {productName} · {varieties.length ? `선택 품종 ${varieties.join(", ")}` : "전체 품종"} · {origin || "전체 산지"}
        {" · "}{unit || "규격별 구분"} · {grade ? `${grade} 등급` : "전체 등급"} · 최근 {days}일
      </p>
      <p className="text-xs text-muted-foreground">현재 선택한 조건 안에서의 비교입니다.</p>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="text-sm">조회 기간 <select className="border rounded p-1 bg-background" value={days} onChange={e => onDaysChange(e.target.value)}>{[7, 30, 90, 365].map(value => <option key={value} value={value}>최근 {value}일</option>)}</select></label>
        <Button size="sm" variant={perKg ? "outline" : "default"} aria-pressed={!perKg} onClick={() => setPerKg(false)}>포장 가격</Button>
        <Button size="sm" variant={perKg ? "default" : "outline"} aria-pressed={perKg} onClick={() => setPerKg(true)}>kg당 가격</Button>
      </div>
      <p className="text-xs text-muted-foreground">품종·등급·포장 규격을 나눠 계산합니다. 중심 가격은 {STAT_LABELS.weightedMedian}(물량 기준), 주요 거래 구간은 P25~P75입니다. 카드·차트·주간표·일별 요약의 {STAT_LABELS.weightedMean}과 다른 통계입니다. 서로 다른 품종·등급의 가격 차이가 품질이나 수익성 순위를 의미하지는 않습니다.</p>
      {!current && <p role="status">분포를 확인하는 중입니다.</p>}
      {current?.error && <div role="alert">{current.error} <Button variant="outline" size="sm" onClick={() => setRetry(n => n + 1)}>다시 시도</Button></div>}
      {current?.data && <>
        {current.data.truncated && <p role="status" className="text-sm text-amber-700">조회 상한으로 최근 20,000행만 분석했습니다. 기간·산지·단위를 좁혀 주세요. 전체 기간을 대표하는 결과가 아닙니다.</p>}
        {current.data.excludedCount > 0 && <p className="text-xs">가격·수량 검증 실패 {current.data.excludedCount}행은 계산에서 제외했습니다. 원본은 보존됩니다.</p>}
        {summaries.length === 0 ? <p>이 조건에서 수집된 거래 기록이 없습니다. 산지나 기간을 넓혀 보세요.</p> :
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <caption className="text-xs text-left text-muted-foreground pb-2">수집된 {current.data.analyzedCount.toLocaleString()}행 기준 · 표본 5행 미만은 대표 가격 보류 · 20행 미만은 표본 적음</caption>
              <thead><tr className="border-b">{["품종 / 등급 / 규격", "중심 가격", "주요 거래 구간", "거래량 / 행 수", "상세"].map(label => <th key={label} className="p-2 whitespace-nowrap">{label}</th>)}</tr></thead>
              <tbody>{summaries.map(row => {
                const divisor = perKg ? row.kgPerPackage : 1;
                return <tr key={JSON.stringify([row.variety, row.grade, row.unit])} className="border-b align-top">
                  <td className="p-2"><span className="font-medium">{row.variety || "품종 미상"}</span><br />{row.grade || "등급 미상"} · {row.unit || "단위 미상"}</td>
                  <td className="p-2 whitespace-nowrap">{!divisor ? "중량 확인 필요" : row.median === null ? "표본 부족" : `${money(row.median / divisor)}${perKg ? "/kg" : ""}`}{row.tradeCount < 20 && <p className="text-xs text-muted-foreground">표본 적음</p>}</td>
                  <td className="p-2 whitespace-nowrap">{divisor && row.p25 !== null && row.p75 !== null ? `${money(row.p25 / divisor)} ~ ${money(row.p75 / divisor)}` : "—"}</td>
                  <td className="p-2 whitespace-nowrap">{row.kgPerPackage ? `${(row.quantity * row.kgPerPackage).toLocaleString("ko-KR")}kg` : `${row.quantity.toLocaleString()} 거래단위`}<br />{row.tradeCount.toLocaleString()}행</td>
                  <td className="p-2 min-w-40"><details><summary className="cursor-pointer">최근 거래 보기</summary><ul className="text-xs space-y-2 mt-2">{row.samples.map(trade => <li key={trade.id}>{new Date(trade.auctionDate).toLocaleDateString("ko-KR")} · {trade.origin || "산지 미상"} · {trade.corporation}<br />{money(trade.price)} / {trade.unit} × {trade.quantity}</li>)}</ul><p className="text-xs mt-2">최근 최대 5행 · 극단 가격도 원본에 유지됩니다.</p></details></td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
        <p className="text-xs text-muted-foreground">조회된 경매 자료의 분포이며 미래 가격 예측 범위가 아닙니다. 수집 누락이 있을 수 있습니다. 동일 가격에 물량이 몰리면 구간에 포함된 물량 비율은 정확히 50%가 아닐 수 있습니다.</p>
      </>}
    </CardContent>
  </Card>;
}
