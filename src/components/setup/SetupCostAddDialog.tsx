"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calculator, Loader2, Plus } from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";

interface Subcategory {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  subcategories: Subcategory[];
}

type Priority = "ESSENTIAL" | "IMPORTANT" | "OPTIONAL";

interface AddDialogState {
  selectedSubcategory: string;
  newItemName: string;
  newItemCost: string;
  newItemPriority: Priority;
  useAreaCalculation: boolean;
  areaInPyeong: string;
  pricePerPyeong: string;
  useLaborCalculation: boolean;
  personCount: string;
  pricePerPerson: string;
  durationMonths: string;
  /** 지출 예정일 (YYYY-MM-DD, 선택) */
  plannedDate: string;
}

function formatKoreanCurrency(value: string): string {
  const num = Number(value);
  if (isNaN(num) || num === 0) return "";
  const eok = Math.floor(num / 100000000);
  const man = Math.floor((num % 100000000) / 10000);
  const won = num % 10000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString()}억`);
  if (man > 0) parts.push(`${man.toLocaleString()}만`);
  if (won > 0 && num < 100000000) parts.push(`${won.toLocaleString()}`);
  return parts.length > 0 ? `${parts.join(" ")}원` : "";
}

function formatNumberWithCommas(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return num.toLocaleString();
}

interface SetupCostAddDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  state: AddDialogState;
  categories: Category[];
  isSubmitting: boolean;
  onFieldChange: <K extends keyof AddDialogState>(field: K, value: AddDialogState[K]) => void;
  onSubmit: () => void;
}

export function SetupCostAddDialog({
  isOpen,
  onOpenChange,
  state,
  categories,
  isSubmitting,
  onFieldChange,
  onSubmit,
}: SetupCostAddDialogProps) {
  const allSubcategories = categories.flatMap((cat) =>
    cat.subcategories.map((sub) => ({
      id: sub.id,
      name: `${cat.name} > ${sub.name}`,
      categoryName: cat.name,
      subcategoryName: sub.name,
    }))
  );

  const selectedSubcategoryInfo = allSubcategories.find((s) => s.id === state.selectedSubcategory);
  const isLandOrFacilityCategory =
    selectedSubcategoryInfo?.categoryName === "토지 및 시설" ||
    selectedSubcategoryInfo?.subcategoryName?.includes("토지") ||
    selectedSubcategoryInfo?.subcategoryName?.includes("시설") ||
    selectedSubcategoryInfo?.subcategoryName?.includes("건축");

  const isLaborCategory =
    selectedSubcategoryInfo?.subcategoryName?.includes("인력") ||
    selectedSubcategoryInfo?.subcategoryName?.includes("인건비") ||
    selectedSubcategoryInfo?.categoryName === "운영비";

  const calculatedCost =
    state.areaInPyeong && state.pricePerPyeong
      ? (Number(state.areaInPyeong) * Number(state.pricePerPyeong)).toString()
      : "";

  const calculatedLaborCost =
    state.personCount && state.pricePerPerson && state.durationMonths
      ? (
          Number(state.personCount) *
          Number(state.pricePerPerson) *
          Number(state.durationMonths)
        ).toString()
      : "";

  // Auto-fill cost when area calculation changes
  useEffect(() => {
    if (state.useAreaCalculation && calculatedCost) {
      onFieldChange("newItemCost", calculatedCost);
    }
  }, [calculatedCost, state.useAreaCalculation]);

  // Auto-fill cost when labor calculation changes
  useEffect(() => {
    if (state.useLaborCalculation && calculatedLaborCost) {
      onFieldChange("newItemCost", calculatedLaborCost);
    }
  }, [calculatedLaborCost, state.useLaborCalculation]);

  // Reset calculation modes on subcategory change
  useEffect(() => {
    if (!state.selectedSubcategory) return;

    let subInfo: { categoryName: string; subcategoryName: string } | null = null;
    for (const cat of categories) {
      const sub = cat.subcategories.find((s) => s.id === state.selectedSubcategory);
      if (sub) {
        subInfo = { categoryName: cat.name, subcategoryName: sub.name };
        break;
      }
    }

    const isLandOrFacility =
      subInfo?.categoryName === "토지 및 시설" ||
      subInfo?.subcategoryName?.includes("토지") ||
      subInfo?.subcategoryName?.includes("시설") ||
      subInfo?.subcategoryName?.includes("건축");

    const isLabor =
      subInfo?.subcategoryName?.includes("인력") ||
      subInfo?.subcategoryName?.includes("인건비") ||
      subInfo?.categoryName === "운영비";

    onFieldChange("useAreaCalculation", false);
    onFieldChange("useLaborCalculation", false);
    onFieldChange("areaInPyeong", "");
    onFieldChange("pricePerPyeong", "");
    onFieldChange("personCount", "");
    onFieldChange("pricePerPerson", "");
    onFieldChange("durationMonths", "");

    if (isLandOrFacility) {
      onFieldChange("useAreaCalculation", true);
    } else if (isLabor) {
      onFieldChange("useLaborCalculation", true);
    }
  }, [state.selectedSubcategory, categories]);

  const isCostReadOnly =
    (state.useAreaCalculation && !!calculatedCost) ||
    (state.useLaborCalculation && !!calculatedLaborCost);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          항목 추가
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>비용 항목 추가</DialogTitle>
          <DialogDescription>새로운 설립 비용 항목을 등록합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>카테고리</Label>
            <Select
              value={state.selectedSubcategory}
              onValueChange={(v) => onFieldChange("selectedSubcategory", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="카테고리 선택" />
              </SelectTrigger>
              <SelectContent>
                {allSubcategories.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>항목명</Label>
            <Input
              placeholder="예: 비닐하우스 설치"
              value={state.newItemName}
              onChange={(e) => onFieldChange("newItemName", e.target.value)}
            />
          </div>

          {isLandOrFacilityCategory && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">평수 기반 계산</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>면적 (평)</Label>
                  <Input
                    type="number"
                    placeholder="3000"
                    value={state.areaInPyeong}
                    onChange={(e) => onFieldChange("areaInPyeong", e.target.value)}
                  />
                  {state.areaInPyeong && (
                    <p className="text-xs text-muted-foreground">
                      {formatNumberWithCommas(state.areaInPyeong)}평
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>평단가 (원)</Label>
                  <Input
                    type="number"
                    placeholder="400000"
                    value={state.pricePerPyeong}
                    onChange={(e) => onFieldChange("pricePerPyeong", e.target.value)}
                  />
                  {state.pricePerPyeong && (
                    <p className="text-xs text-muted-foreground">
                      {formatNumberWithCommas(state.pricePerPyeong)}원 (
                      {formatKoreanCurrency(state.pricePerPyeong) || "0원"})
                    </p>
                  )}
                </div>
              </div>
              {state.areaInPyeong && state.pricePerPyeong && (
                <div className="text-sm text-muted-foreground">
                  계산: {Number(state.areaInPyeong).toLocaleString()}평 ×{" "}
                  {Number(state.pricePerPyeong).toLocaleString()}원 ={" "}
                  <span className="font-semibold text-foreground">
                    {formatLargeNumber(calculatedCost)}
                  </span>
                </div>
              )}
            </div>
          )}

          {isLaborCategory && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">인건비 계산</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>인원수 (명)</Label>
                  <Input
                    type="number"
                    placeholder="2"
                    value={state.personCount}
                    onChange={(e) => onFieldChange("personCount", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>인당 월급 (원)</Label>
                  <Input
                    type="number"
                    placeholder="3000000"
                    value={state.pricePerPerson}
                    onChange={(e) => onFieldChange("pricePerPerson", e.target.value)}
                  />
                  {state.pricePerPerson && (
                    <p className="text-xs text-muted-foreground">
                      {formatKoreanCurrency(state.pricePerPerson) || "0원"}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>기간 (개월)</Label>
                  <Input
                    type="number"
                    placeholder="12"
                    value={state.durationMonths}
                    onChange={(e) => onFieldChange("durationMonths", e.target.value)}
                  />
                </div>
              </div>
              {state.personCount && state.pricePerPerson && state.durationMonths && (
                <div className="text-sm text-muted-foreground">
                  계산: {Number(state.personCount).toLocaleString()}명 ×{" "}
                  {formatKoreanCurrency(state.pricePerPerson)} ×{" "}
                  {Number(state.durationMonths).toLocaleString()}개월 ={" "}
                  <span className="font-semibold text-foreground">
                    {formatLargeNumber(calculatedLaborCost)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>예상 비용 (원)</Label>
            <Input
              type="number"
              placeholder="50000000"
              value={state.newItemCost}
              onChange={(e) => onFieldChange("newItemCost", e.target.value)}
              readOnly={isCostReadOnly}
              className={isCostReadOnly ? "bg-muted" : ""}
            />
            {state.newItemCost && (
              <p className="text-xs text-blue-600 font-medium">
                {formatNumberWithCommas(state.newItemCost)}원 ={" "}
                {formatKoreanCurrency(state.newItemCost) || "0원"}
              </p>
            )}
            {state.useAreaCalculation && calculatedCost && (
              <p className="text-xs text-muted-foreground">평수 계산에서 자동 입력됨</p>
            )}
            {state.useLaborCalculation && calculatedLaborCost && (
              <p className="text-xs text-muted-foreground">인건비 계산에서 자동 입력됨</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>지출 예정일 (선택)</Label>
            <Input
              type="date"
              value={state.plannedDate}
              onChange={(e) => onFieldChange("plannedDate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              비워 두면 현금흐름 예측에서 영농 시작 달(입력 시) 또는 예측 첫 달에 계상합니다.
            </p>
          </div>

          <div className="space-y-2">
            <Label>우선순위</Label>
            <Select
              value={state.newItemPriority}
              onValueChange={(v) => onFieldChange("newItemPriority", v as Priority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ESSENTIAL">필수</SelectItem>
                <SelectItem value="IMPORTANT">중요</SelectItem>
                <SelectItem value="OPTIONAL">선택</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
