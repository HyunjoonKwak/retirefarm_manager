"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  CheckCircle,
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatLargeNumber, formatPercent } from "@/lib/utils/format";
import { toast } from "sonner";

interface SetupCostItem {
  id: string;
  name: string;
  description?: string;
  estimatedCost: string;
  actualCost?: string;
  quantity: number;
  unit: string;
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
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemPriority, setNewItemPriority] = useState<"ESSENTIAL" | "IMPORTANT" | "OPTIONAL">("ESSENTIAL");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function fetchData() {
    try {
      const [categoriesRes, summaryRes] = await Promise.all([
        fetch("/api/setup/categories"),
        fetch("/api/setup/summary"),
      ]);

      const categoriesData = await categoriesRes.json();
      const summaryData = await summaryRes.json();

      setCategories(categoriesData.categories || []);
      setSummary(summaryData.summary || null);

      // 첫 번째 카테고리 펼치기
      if (categoriesData.categories?.length > 0) {
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
        fetchData();
      }
    } catch {
      toast.error("항목 등록 중 오류가 발생했습니다.");
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
        fetchData();
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
        fetchData();
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

  // 서브카테고리 목록 생성
  const allSubcategories = categories.flatMap((cat) =>
    cat.subcategories.map((sub) => ({
      id: sub.id,
      name: `${cat.name} > ${sub.name}`,
    }))
  );

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">정부 지원금</CardTitle>
              <Wallet className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatLargeNumber(summary.totalSubsidy)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">자기자본 필요액</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatLargeNumber(summary.selfFundingRequired)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">진행률</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercent(summary.progressRate, 0)}</div>
              <Progress value={summary.progressRate} className="mt-2" />
            </CardContent>
          </Card>
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
              <div className="space-y-2">
                <Label>예상 비용 (원)</Label>
                <Input
                  type="number"
                  placeholder="50000000"
                  value={newItemCost}
                  onChange={(e) => setNewItemCost(e.target.value)}
                />
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
                              <span className="font-medium">{item.name}</span>
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
    </div>
  );
}
