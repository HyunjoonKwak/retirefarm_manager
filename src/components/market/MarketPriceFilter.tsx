"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Loader2, AlertCircle } from "lucide-react";
import {
  VarietyFacetsScope,
  VarietyFacetsStatus,
  VarietyOption,
  VarietyOptionsResult,
} from "./marketPriceTypes";

interface MarketPriceFilterProps {
  origins: string[];
  selectedOrigin: string | null;
  onOriginChange: (origin: string | null) => void;

  varietyOptions: VarietyOptionsResult;
  selectedVarieties: string[];
  onVarietiesChange: (varieties: string[]) => void;
  showAllVarieties: boolean;
  onShowAllVarietiesChange: (showAll: boolean) => void;
  facetsStatus: VarietyFacetsStatus;
  facetsAsOf: string | null;
  facetsError: string | null;
  facetsScope: VarietyFacetsScope | null;

  unitOptions: string[];
  selectedUnit: string | null;
  onUnitChange: (unit: string | null) => void;

  gradeOptions: string[];
  selectedGrade: string | null;
  onGradeChange: (grade: string | null) => void;

  canExtendPeriod: boolean;
  onExtendPeriod: () => void;
}

function formatAsOf(asOf: string | null): string {
  if (!asOf) return "";
  const date = new Date(asOf);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function varietyButtonClass(option: VarietyOption): string {
  if (option.selected) return "";
  if (option.status === "available") return "";
  if (option.status === "unknown") return "border-dashed";
  return "border-dashed text-muted-foreground";
}

export function MarketPriceFilter({
  origins,
  selectedOrigin,
  onOriginChange,
  varietyOptions,
  selectedVarieties,
  onVarietiesChange,
  showAllVarieties,
  onShowAllVarietiesChange,
  facetsStatus,
  facetsAsOf,
  facetsError,
  facetsScope,
  unitOptions,
  selectedUnit,
  onUnitChange,
  gradeOptions,
  selectedGrade,
  onGradeChange,
  canExtendPeriod,
  onExtendPeriod,
}: MarketPriceFilterProps) {
  function toggleVariety(variety: string) {
    if (selectedVarieties.includes(variety)) {
      onVarietiesChange(selectedVarieties.filter((sv) => sv !== variety));
    } else {
      onVarietiesChange([...selectedVarieties, variety]);
    }
  }

  const hasFilter = selectedVarieties.length > 0 || selectedOrigin || selectedUnit || selectedGrade;
  const { options, hiddenCount, availableCount, selectedUnavailable } = varietyOptions;
  const hasFilteredOut = selectedUnavailable.some((o) => o.status === "filtered_out");
  const hasNoPeriod = selectedUnavailable.some((o) => o.status === "no_period_records");
  const hasUnobserved = selectedUnavailable.some((o) => o.status === "unobserved");

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        {/* 산지·단위 — 품종보다 위에 둔다. 품종 목록은 이 조건에 따라 달라진다. */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <Label className="text-sm whitespace-nowrap" htmlFor="market-origin-select">
              산지
            </Label>
            <Select
              value={selectedOrigin || "_all"}
              onValueChange={(v) => onOriginChange(v === "_all" ? null : v)}
            >
              <SelectTrigger className="w-full sm:w-32" id="market-origin-select">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">전체</SelectItem>
                {Array.from(new Set([...origins, ...(selectedOrigin ? [selectedOrigin] : [])])).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {unitOptions.length > 0 && (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <Label className="text-sm whitespace-nowrap" htmlFor="market-unit-select">
                단위
              </Label>
              <Select
                value={selectedUnit || "_all"}
                onValueChange={(v) => onUnitChange(v === "_all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-28" id="market-unit-select">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">전체</SelectItem>
                  {unitOptions.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {gradeOptions.length > 0 && (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <Label className="text-sm whitespace-nowrap" htmlFor="market-grade-select">
                등급
              </Label>
              <Select
                value={selectedGrade || "_all"}
                onValueChange={(v) => onGradeChange(v === "_all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-28" id="market-grade-select">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">전체</SelectItem>
                  {gradeOptions.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="self-end"
              onClick={() => {
                onVarietiesChange([]);
                onOriginChange(null);
                onUnitChange(null);
                onGradeChange(null);
              }}
            >
              필터 초기화
            </Button>
          )}
        </div>

        {/* 품종 — 산지 조건에 연동 */}
        <div className="space-y-2 pt-3 border-t" data-testid="variety-section">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Label className="text-sm">품종 (다중선택)</Label>
              {facetsStatus === "loading" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> 거래 확인 중
                </span>
              )}
              {facetsStatus === "ready" && (
                <span className="text-xs text-muted-foreground">
                  거래 확인 {availableCount}개
                  {selectedOrigin ? ` · 산지 '${selectedOrigin}'` : " · 전체 산지"}
                  {facetsScope ? ` · 최근 ${facetsScope.days}일` : ""}
                  {facetsAsOf ? ` · 수집 자료 기준 · 조회 ${formatAsOf(facetsAsOf)}` : ""}
                </span>
              )}
              {facetsStatus === "error" && (
                <span className="flex items-center gap-1 text-xs text-amber-700" role="status">
                  <AlertCircle className="h-3 w-3" />
                  거래 확인 실패{facetsError ? ` (${facetsError})` : ""} — 확인 필요, 전체 목록에서 직접 탐색하세요
                </span>
              )}
            </div>
            {facetsStatus !== "error" && (hiddenCount > 0 || showAllVarieties) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onShowAllVarietiesChange(!showAllVarieties)}
                aria-pressed={showAllVarieties}
              >
                {showAllVarieties ? "거래 확인만 보기" : `전체 보기 (+${hiddenCount})`}
              </Button>
            )}
          </div>

          {options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <Button
                  key={option.variety}
                  variant={option.selected ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleVariety(option.variety)}
                  title={option.reason}
                  aria-label={`${option.variety} ${option.shortLabel} — ${option.reason}`}
                  aria-pressed={option.selected}
                  data-availability={option.status}
                  className={varietyButtonClass(option)}
                >
                  {option.status === "available" && (
                    <span
                      aria-hidden
                      className={`mr-1 inline-block h-2 w-2 rounded-full ${option.selected ? "bg-primary-foreground" : "bg-green-500"}`}
                    />
                  )}
                  {option.selected && <span aria-hidden className="mr-1">✓</span>}
                  {option.variety}
                  <span className="ml-1 text-[11px] opacity-80">{option.shortLabel}</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {facetsStatus === "loading"
                ? "품종을 확인하는 중입니다."
                : facetsStatus === "ready"
                  ? "현재 산지·단위·기간 조건에 거래가 확인된 품종이 없습니다. 전체 보기에서 다른 품종을 살펴보거나 조건을 넓혀 보세요."
                  : "품목을 선택하면 품종이 표시됩니다."}
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            채움 = 선택됨 · <span className="inline-block h-2 w-2 rounded-full bg-green-500 align-middle" /> = 현재
            산지·단위·기간에 수집된 거래 있음 · 점선 = 이 조건의 거래 기록 미확인(이유 표시). 저장된 경매 자료 기준이며 산지
            부재를 뜻하지 않습니다.
          </p>

          {showAllVarieties && options.some((o) => o.status !== "available") && (
            <ul className="text-xs text-muted-foreground space-y-1">
              {options.filter((o) => o.status !== "available").map((o) => (
                <li key={o.variety}>{o.variety}: {o.reason}</li>
              ))}
            </ul>
          )}

          {selectedUnavailable.length > 0 && (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 space-y-1"
              role="note"
            >
              <p>
                선택한 품종 중 {selectedUnavailable.length}개는 현재 조건에 수집된 거래 기록이 없습니다:{" "}
                {selectedUnavailable.map((o) => `${o.variety}(${o.shortLabel})`).join(", ")}. 선택은 유지되며 버튼을
                눌러 해제할 수 있습니다.
              </p>
              <div className="flex flex-wrap gap-2">
                {hasFilteredOut && selectedUnit && (
                  <Button variant="outline" size="sm" className="h-7" onClick={() => onUnitChange(null)}>
                    단위 해제
                  </Button>
                )}
                {hasNoPeriod && canExtendPeriod && (
                  <Button variant="outline" size="sm" className="h-7" onClick={onExtendPeriod}>
                    기간 확장
                  </Button>
                )}
                {hasUnobserved && <span className="self-center">기록 없음 품종은 수집 여부 확인이 필요합니다.</span>}
              </div>
            </div>
          )}
        </div>

        {selectedVarieties.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2 border-t">
            <span className="text-xs text-muted-foreground mr-2">선택됨:</span>
            {selectedVarieties.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => onVarietiesChange(selectedVarieties.filter((sv) => sv !== v))}
              >
                {v}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
