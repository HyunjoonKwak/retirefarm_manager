"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Trash2,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";
import { toast } from "sonner";
import { SetupCostAddDialog } from "./SetupCostAddDialog";

interface SetupCostItem {
  id: string;
  name: string;
  description?: string;
  estimatedCost: string;
  actualCost?: string;
  quantity: number;
  unit: string;
  areaInPyeong?: string;
  pricePerPyeong?: string;
  personCount?: number;
  pricePerPerson?: string;
  durationMonths?: number;
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

type Priority = "ESSENTIAL" | "IMPORTANT" | "OPTIONAL";

const PRIORITY_LABELS = {
  ESSENTIAL: { label: "필수", color: "bg-red-100 text-red-800" },
  IMPORTANT: { label: "중요", color: "bg-yellow-100 text-yellow-800" },
  OPTIONAL: { label: "선택", color: "bg-gray-100 text-gray-800" },
};

const STATUS_LABELS = {
  PLANNED: { label: "계획" },
  QUOTED: { label: "견적완료" },
  ORDERED: { label: "발주" },
  DELIVERED: { label: "납품" },
  INSTALLED: { label: "설치완료" },
};

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

export function SetupCostManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add dialog state
  const [addState, setAddState] = useState({
    selectedSubcategory: "",
    newItemName: "",
    newItemCost: "",
    newItemPriority: "ESSENTIAL" as Priority,
    useAreaCalculation: false,
    areaInPyeong: "",
    pricePerPyeong: "",
    useLaborCalculation: false,
    personCount: "",
    pricePerPerson: "",
    durationMonths: "",
  });

  // Edit dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SetupCostItem | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemCost, setEditItemCost] = useState("");
  const [editItemPriority, setEditItemPriority] = useState<Priority>("ESSENTIAL");

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

  function handleAddFieldChange<K extends keyof typeof addState>(
    field: K,
    value: (typeof addState)[K]
  ) {
    setAddState((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAddItem() {
    if (!addState.selectedSubcategory || !addState.newItemName || !addState.newItemCost) {
      toast.error("모든 필수 항목을 입력해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/setup/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subcategoryId: addState.selectedSubcategory,
          name: addState.newItemName,
          estimatedCost: Number(addState.newItemCost),
          priority: addState.newItemPriority,
          areaInPyeong: addState.areaInPyeong ? Number(addState.areaInPyeong) : undefined,
          pricePerPyeong: addState.pricePerPyeong ? Number(addState.pricePerPyeong) : undefined,
          personCount: addState.personCount ? Number(addState.personCount) : undefined,
          pricePerPerson: addState.pricePerPerson ? Number(addState.pricePerPerson) : undefined,
          durationMonths: addState.durationMonths ? Number(addState.durationMonths) : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "항목 등록에 실패했습니다.");
      } else {
        toast.success("항목이 등록되었습니다.");
        setIsAddDialogOpen(false);
        setAddState({
          selectedSubcategory: "",
          newItemName: "",
          newItemCost: "",
          newItemPriority: "ESSENTIAL",
          useAreaCalculation: false,
          areaInPyeong: "",
          pricePerPyeong: "",
          useLaborCalculation: false,
          personCount: "",
          pricePerPerson: "",
          durationMonths: "",
        });
        fetchData(true);
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
        fetchData(true);
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
      const response = await fetch(`/api/setup/items/${itemId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "삭제에 실패했습니다.");
      } else {
        toast.success("항목이 삭제되었습니다.");
        fetchData(true);
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
        fetchData(true);
      }
    } catch {
      toast.error("상태 변경 중 오류가 발생했습니다.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
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
              <p className="text-xs text-muted-foreground">{summary.totalItems}개 항목</p>
            </CardContent>
          </Card>

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

      {/* Add item dialog button */}
      <div className="flex justify-end">
        <SetupCostAddDialog
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          state={addState}
          categories={categories}
          isSubmitting={isSubmitting}
          onFieldChange={handleAddFieldChange}
          onSubmit={handleAddItem}
        />
      </div>

      {/* Category list */}
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
                              <span
                                className={`px-2 py-0.5 rounded text-xs ${PRIORITY_LABELS[item.priority].color}`}
                              >
                                {PRIORITY_LABELS[item.priority].label}
                              </span>
                              <div>
                                <span className="font-medium">{item.name}</span>
                                {item.areaInPyeong && item.pricePerPyeong && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({Number(item.areaInPyeong).toLocaleString()}평 ×{" "}
                                    {formatLargeNumber(item.pricePerPyeong)}/평)
                                  </span>
                                )}
                                {item.personCount && item.pricePerPerson && item.durationMonths && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({item.personCount}명 ×{" "}
                                    {formatLargeNumber(item.pricePerPerson)}/월 ×{" "}
                                    {item.durationMonths}개월)
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
                      <p className="text-sm text-muted-foreground py-2">등록된 항목이 없습니다.</p>
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

      {/* Edit dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비용 항목 수정</DialogTitle>
            <DialogDescription>설립 비용 항목을 수정합니다.</DialogDescription>
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
                  {formatNumberWithCommas(editItemCost)}원 ={" "}
                  {formatKoreanCurrency(editItemCost) || "0원"}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>우선순위</Label>
              <Select
                value={editItemPriority}
                onValueChange={(v) => setEditItemPriority(v as Priority)}
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
