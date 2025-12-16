"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calculator,
  Wallet,
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";
import { toast } from "sonner";

interface SetupCostItem {
  id: string;
  name: string;
  description?: string;
  estimatedCost: string;
  actualCost?: string;
  quantity: number;
  unit: string;
  areaInPyeong?: string;      // 면적 (평)
  pricePerPyeong?: string;    // 평단가 (원)
  personCount?: number;       // 인원수 (인건비용)
  pricePerPerson?: string;    // 인당 단가 (인건비용)
  durationMonths?: number;    // 기간 (개월, 인건비용)
  isGovernmentSubsidy: boolean;
  subsidyAmount?: string;
  priority: "ESSENTIAL" | "IMPORTANT" | "OPTIONAL";
  status: "PLANNED" | "QUOTED" | "ORDERED" | "DELIVERED" | "INSTALLED";
}

interface Subcategory {
  id: string;
  name: string;
  items: SetupCostItem[];
}

interface Category {
  id: string;
  name: string;
  subcategories: Subcategory[];
}

interface Summary {
  totalItems: number;
  totalEstimatedCost: string;
  totalActualCost: string;
  totalSubsidy: string;
  selfFundingRequired: string;
  progressRate: number;
}

interface CategorySummary {
  name: string;
  estimated: string;
  actual: string;
  subsidy: string;
}

const PRIORITY_LABELS = {
  ESSENTIAL: { label: "필수", color: "bg-red-100 text-red-800" },
  IMPORTANT: { label: "중요", color: "bg-yellow-100 text-yellow-800" },
  OPTIONAL: { label: "선택", color: "bg-gray-100 text-gray-800" },
};

const STATUS_LABELS = {
  PLANNED: { label: "계획", color: "default" as const },
  QUOTED: { label: "견적완료", color: "secondary" as const },
  ORDERED: { label: "발주", color: "secondary" as const },
  DELIVERED: { label: "납품", color: "secondary" as const },
  INSTALLED: { label: "설치완료", color: "default" as const },
};

export function SetupCostManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemPriority, setNewItemPriority] = useState<"ESSENTIAL" | "IMPORTANT" | "OPTIONAL">("ESSENTIAL");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 평수/평단가 입력용 상태
  const [useAreaCalculation, setUseAreaCalculation] = useState(false);
  const [areaInPyeong, setAreaInPyeong] = useState("");
  const [pricePerPyeong, setPricePerPyeong] = useState("");

  // 인건비 입력용 상태
  const [useLaborCalculation, setUseLaborCalculation] = useState(false);
  const [personCount, setPersonCount] = useState("");
  const [pricePerPerson, setPricePerPerson] = useState("");
  const [durationMonths, setDurationMonths] = useState("");

  // 수정 다이얼로그
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SetupCostItem | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemCost, setEditItemCost] = useState("");
  const [editItemPriority, setEditItemPriority] = useState<"ESSENTIAL" | "IMPORTANT" | "OPTIONAL">("ESSENTIAL");

  // 금액을 한국어로 변환하는 함수
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

  // 숫자 입력값을 포맷팅된 문자열로 변환
  function formatNumberWithCommas(value: string): string {
    const num = Number(value);
    if (isNaN(num)) return value;
    return num.toLocaleString();
  }

  async function fetchData(preserveExpanded = false) {
    try {
      const [categoriesRes, summaryRes] = await Promise.all([
        fetch("/api/setup/categories"),
        fetch("/api/setup/summary"),
      ]);

      const categoriesData = await categoriesRes.json();
      const summaryData = await summaryRes.json();

      setCategories(categoriesData.categories || []);
      setSummary(summaryData.summary || null);
      setCategorySummary(summaryData.byCategory || []);

      // 첫 로드 시에만 첫 번째 카테고리 펼치기 (이후에는 상태 유지)
      if (!preserveExpanded && categoriesData.categories?.length > 0) {
        setExpandedCategories(new Set([categoriesData.categories[0].id]));
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  function toggleCategory(categoryId: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  async function handleAddItem() {
    if (!selectedSubcategory || !newItemName || !newItemCost) {
      toast.error("모든 필수 항목을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/setup/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subcategoryId: selectedSubcategory,
          name: newItemName,
          estimatedCost: Number(newItemCost),
          priority: newItemPriority,
          areaInPyeong: areaInPyeong ? Number(areaInPyeong) : undefined,
          pricePerPyeong: pricePerPyeong ? Number(pricePerPyeong) : undefined,
          personCount: personCount ? Number(personCount) : undefined,
          pricePerPerson: pricePerPerson ? Number(pricePerPerson) : undefined,
          durationMonths: durationMonths ? Number(durationMonths) : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "항목 등록에 실패했습니다.");
      } else {
        toast.success("항목이 등록되었습니다.");
        setIsAddDialogOpen(false);
        setSelectedSubcategory("");
        setNewItemName("");
        setNewItemCost("");
        setNewItemPriority("ESSENTIAL");
        setAreaInPyeong("");
        setPricePerPyeong("");
        setUseAreaCalculation(false);
        setPersonCount("");
        setPricePerPerson("");
        setDurationMonths("");
        setUseLaborCalculation(false);
        fetchData(true); // 펼침 상태 유지
      }
    } catch {
      toast.error("항목 등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEditStart(item: SetupCostItem) {
    setEditingItem(item);
    setEditItemName(item.name);
    setEditItemCost(item.estimatedCost);
    setEditItemPriority(item.priority);
    setIsEditDialogOpen(true);
  }

  async function handleEditItem() {
    if (!editingItem) return;
    if (!editItemName || !editItemCost) {
      toast.error("필수 항목을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/setup/items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editItemName,
          estimatedCost: Number(editItemCost),
          priority: editItemPriority,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "수정에 실패했습니다.");
      } else {
        toast.success("항목이 수정되었습니다.");
        setIsEditDialogOpen(false);
        setEditingItem(null);
        fetchData(true); // 펼침 상태 유지
      }
    } catch {
      toast.error("수정 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/setup/items/${itemId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "삭제에 실패했습니다.");
      } else {
        toast.success("항목이 삭제되었습니다.");
        fetchData(true); // 펼침 상태 유지
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    }
  }

  async function handleUpdateStatus(itemId: string, newStatus: string) {
    try {
      const response = await fetch(`/api/setup/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "상태 변경에 실패했습니다.");
      } else {
        toast.success("상태가 변경되었습니다.");
        fetchData(true); // 펼침 상태 유지
      }
    } catch {
      toast.error("상태 변경 중 오류가 발생했습니다.");
    }
  }

  // 서브카테고리 목록 생성
  const allSubcategories = categories.flatMap((cat) =>
    cat.subcategories.map((sub) => ({
      id: sub.id,
      name: `${cat.name} > ${sub.name}`,
      categoryName: cat.name,
      subcategoryName: sub.name,
    }))
  );

  // 토지나 시설/건축물 카테고리인지 확인
  const selectedSubcategoryInfo = allSubcategories.find((s) => s.id === selectedSubcategory);
  const isLandOrFacilityCategory =
    selectedSubcategoryInfo?.categoryName === "토지 및 시설" ||
    selectedSubcategoryInfo?.subcategoryName?.includes("토지") ||
    selectedSubcategoryInfo?.subcategoryName?.includes("시설") ||
    selectedSubcategoryInfo?.subcategoryName?.includes("건축");

  // 인건비 카테고리인지 확인
  const isLaborCategory =
    selectedSubcategoryInfo?.subcategoryName?.includes("인력") ||
    selectedSubcategoryInfo?.subcategoryName?.includes("인건비") ||
    selectedSubcategoryInfo?.categoryName === "운영비";

  // 평수 * 평단가 계산
  const calculatedCost =
    areaInPyeong && pricePerPyeong
      ? (Number(areaInPyeong) * Number(pricePerPyeong)).toString()
      : "";

  // 인건비 계산 (인원수 × 인당 단가 × 기간)
  const calculatedLaborCost =
    personCount && pricePerPerson && durationMonths
      ? (Number(personCount) * Number(pricePerPerson) * Number(durationMonths)).toString()
      : "";

  // 평수 계산 모드일 때 비용 자동 설정
  useEffect(() => {
    if (useAreaCalculation && calculatedCost) {
      setNewItemCost(calculatedCost);
    }
  }, [calculatedCost, useAreaCalculation]);

  // 인건비 계산 모드일 때 비용 자동 설정
  useEffect(() => {
    if (useLaborCalculation && calculatedLaborCost) {
      setNewItemCost(calculatedLaborCost);
    }
  }, [calculatedLaborCost, useLaborCalculation]);

  // 카테고리 변경 시 계산 모드 초기화
  useEffect(() => {
    if (!selectedSubcategory) return;

    // categories에서 직접 찾기
    let subInfo: { categoryName: string; subcategoryName: string } | null = null;
    for (const cat of categories) {
      const sub = cat.subcategories.find((s) => s.id === selectedSubcategory);
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

    // 모든 계산 모드 초기화
    setUseAreaCalculation(false);
    setUseLaborCalculation(false);
    setAreaInPyeong("");
    setPricePerPyeong("");
    setPersonCount("");
    setPricePerPerson("");
    setDurationMonths("");

    if (isLandOrFacility) {
      setUseAreaCalculation(true);
    } else if (isLabor) {
      setUseLaborCalculation(true);
    }
  }, [selectedSubcategory, categories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 예상 비용</CardTitle>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatLargeNumber(summary.totalEstimatedCost)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.totalItems}개 항목
              </p>
            </CardContent>
          </Card>

          {/* 카테고리별 비용 요약 */}
          {["토지 및 시설", "장비", "운영준비", "기타"].map((categoryName) => {
            const catData = categorySummary.find((c) => c.name === categoryName);
            return (
              <Card key={categoryName}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{categoryName}</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {catData ? formatLargeNumber(catData.estimated) : "0원"}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 항목 추가 버튼 */}
      <div className="flex justify-end">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              항목 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>비용 항목 추가</DialogTitle>
              <DialogDescription>
                새로운 설립 비용 항목을 등록합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>카테고리</Label>
                <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
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
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                />
              </div>
              {/* 토지/시설 카테고리일 때 평수 계산 UI */}
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
                        value={areaInPyeong}
                        onChange={(e) => setAreaInPyeong(e.target.value)}
                      />
                      {areaInPyeong && (
                        <p className="text-xs text-muted-foreground">
                          {formatNumberWithCommas(areaInPyeong)}평
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>평단가 (원)</Label>
                      <Input
                        type="number"
                        placeholder="400000"
                        value={pricePerPyeong}
                        onChange={(e) => setPricePerPyeong(e.target.value)}
                      />
                      {pricePerPyeong && (
                        <p className="text-xs text-muted-foreground">
                          {formatNumberWithCommas(pricePerPyeong)}원 ({formatKoreanCurrency(pricePerPyeong) || "0원"})
                        </p>
                      )}
                    </div>
                  </div>
                  {areaInPyeong && pricePerPyeong && (
                    <div className="text-sm text-muted-foreground">
                      계산: {Number(areaInPyeong).toLocaleString()}평 × {Number(pricePerPyeong).toLocaleString()}원 ={" "}
                      <span className="font-semibold text-foreground">
                        {formatLargeNumber(calculatedCost)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 인건비 카테고리일 때 인건비 계산 UI */}
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
                        value={personCount}
                        onChange={(e) => setPersonCount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>인당 월급 (원)</Label>
                      <Input
                        type="number"
                        placeholder="3000000"
                        value={pricePerPerson}
                        onChange={(e) => setPricePerPerson(e.target.value)}
                      />
                      {pricePerPerson && (
                        <p className="text-xs text-muted-foreground">
                          {formatKoreanCurrency(pricePerPerson) || "0원"}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>기간 (개월)</Label>
                      <Input
                        type="number"
                        placeholder="12"
                        value={durationMonths}
                        onChange={(e) => setDurationMonths(e.target.value)}
                      />
                    </div>
                  </div>
                  {personCount && pricePerPerson && durationMonths && (
                    <div className="text-sm text-muted-foreground">
                      계산: {Number(personCount).toLocaleString()}명 × {formatKoreanCurrency(pricePerPerson)} × {Number(durationMonths).toLocaleString()}개월 ={" "}
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
                  value={newItemCost}
                  onChange={(e) => setNewItemCost(e.target.value)}
                  readOnly={(useAreaCalculation && !!calculatedCost) || (useLaborCalculation && !!calculatedLaborCost)}
                  className={(useAreaCalculation && calculatedCost) || (useLaborCalculation && calculatedLaborCost) ? "bg-muted" : ""}
                />
                {newItemCost && (
                  <p className="text-xs text-blue-600 font-medium">
                    {formatNumberWithCommas(newItemCost)}원 = {formatKoreanCurrency(newItemCost) || "0원"}
                  </p>
                )}
                {useAreaCalculation && calculatedCost && (
                  <p className="text-xs text-muted-foreground">
                    평수 계산에서 자동 입력됨
                  </p>
                )}
                {useLaborCalculation && calculatedLaborCost && (
                  <p className="text-xs text-muted-foreground">
                    인건비 계산에서 자동 입력됨
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>우선순위</Label>
                <Select value={newItemPriority} onValueChange={(v) => setNewItemPriority(v as typeof newItemPriority)}>
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
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddItem} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                등록
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 카테고리별 항목 목록 */}
      <div className="space-y-4">
        {categories.map((category) => (
          <Card key={category.id}>
            <CardHeader
              className="cursor-pointer"
              onClick={() => toggleCategory(category.id)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {expandedCategories.has(category.id) ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                  {category.name}
                </CardTitle>
                <CardDescription>
                  {category.subcategories.reduce((sum, sub) => sum + sub.items.length, 0)}개 항목
                </CardDescription>
              </div>
            </CardHeader>
            {expandedCategories.has(category.id) && (
              <CardContent>
                {category.subcategories.map((subcategory) => (
                  <div key={subcategory.id} className="mb-4 last:mb-0">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      {subcategory.name}
                    </h4>
                    {subcategory.items.length > 0 ? (
                      <div className="space-y-2">
                        {subcategory.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded text-xs ${PRIORITY_LABELS[item.priority].color}`}>
                                {PRIORITY_LABELS[item.priority].label}
                              </span>
                              <div>
                                <span className="font-medium">{item.name}</span>
                                {item.areaInPyeong && item.pricePerPyeong && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({Number(item.areaInPyeong).toLocaleString()}평 × {formatLargeNumber(item.pricePerPyeong)}/평)
                                  </span>
                                )}
                                {item.personCount && item.pricePerPerson && item.durationMonths && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({item.personCount}명 × {formatLargeNumber(item.pricePerPerson)}/월 × {item.durationMonths}개월)
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm font-medium">
                                {formatLargeNumber(item.estimatedCost)}
                              </span>
                              <Select
                                value={item.status}
                                onValueChange={(v) => handleUpdateStatus(item.id, v)}
                              >
                                <SelectTrigger className="w-[120px] h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                                    <SelectItem key={key} value={key}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleEditStart(item)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-700"
                                onClick={() => handleDeleteItem(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">
                        등록된 항목이 없습니다.
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {categories.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calculator className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              비용 카테고리가 없습니다. 데이터베이스 시드를 실행해주세요.
            </p>
            <code className="text-sm bg-muted px-2 py-1 rounded">npm run db:seed</code>
          </CardContent>
        </Card>
      )}

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비용 항목 수정</DialogTitle>
            <DialogDescription>
              설립 비용 항목을 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>항목명</Label>
              <Input
                placeholder="예: 비닐하우스 설치"
                value={editItemName}
                onChange={(e) => setEditItemName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>예상 비용 (원)</Label>
              <Input
                type="number"
                placeholder="50000000"
                value={editItemCost}
                onChange={(e) => setEditItemCost(e.target.value)}
              />
              {editItemCost && (
                <p className="text-xs text-blue-600 font-medium">
                  {formatNumberWithCommas(editItemCost)}원 = {formatKoreanCurrency(editItemCost) || "0원"}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>우선순위</Label>
              <Select value={editItemPriority} onValueChange={(v) => setEditItemPriority(v as typeof editItemPriority)}>
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
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleEditItem} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              수정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
