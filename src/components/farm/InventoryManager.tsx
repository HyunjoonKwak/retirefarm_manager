"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  Plus,
  Loader2,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  currentQuantity: number;
  unit: string;
  minimumQuantity: number;
  lastPurchaseDate: string | null;
  lastPurchasePrice: number | null;
  location: string | null;
  expirationDate: string | null;
}

const CATEGORY_CONFIG = {
  SEED: { label: "종자", color: "bg-green-100 text-green-800" },
  FERTILIZER: { label: "비료", color: "bg-yellow-100 text-yellow-800" },
  PESTICIDE: { label: "농약", color: "bg-red-100 text-red-800" },
  TOOL: { label: "농기구", color: "bg-blue-100 text-blue-800" },
  PACKAGING: { label: "포장재", color: "bg-purple-100 text-purple-800" },
  OTHER: { label: "기타", color: "bg-gray-100 text-gray-800" },
};

export function InventoryManager() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showLowStock, setShowLowStock] = useState(false);

  // 품목 추가 다이얼로그
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "SEED" as keyof typeof CATEGORY_CONFIG,
    currentQuantity: "",
    unit: "",
    minimumQuantity: "",
  });

  // 입출고 다이얼로그
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustType, setAdjustType] = useState<"IN" | "OUT">("IN");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  async function fetchItems() {
    try {
      let url = "/api/farm/inventory";
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.append("category", categoryFilter);
      if (showLowStock) params.append("lowStock", "true");
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url);
      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      console.error("Failed to fetch items:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchItems();
  }, [categoryFilter, showLowStock]);

  async function handleAddItem() {
    if (!newItem.name || !newItem.currentQuantity || !newItem.unit) {
      toast.error("필수 항목을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/farm/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newItem,
          currentQuantity: Number(newItem.currentQuantity),
          minimumQuantity: Number(newItem.minimumQuantity) || 0,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "등록에 실패했습니다.");
      } else {
        toast.success("품목이 등록되었습니다.");
        setIsAddDialogOpen(false);
        setNewItem({
          name: "",
          category: "SEED",
          currentQuantity: "",
          unit: "",
          minimumQuantity: "",
        });
        fetchItems();
      }
    } catch {
      toast.error("등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteItem(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/farm/inventory/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "삭제에 실패했습니다.");
      } else {
        toast.success("품목이 삭제되었습니다.");
        fetchItems();
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    }
  }

  async function handleAdjustQuantity() {
    if (!adjustItem || !adjustQuantity || !adjustReason) {
      toast.error("수량과 사유를 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/farm/inventory/${adjustItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: adjustType,
          quantity: Number(adjustQuantity),
          reason: adjustReason,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "처리에 실패했습니다.");
      } else {
        toast.success(result.message);
        setAdjustDialogOpen(false);
        setAdjustItem(null);
        setAdjustQuantity("");
        setAdjustReason("");
        fetchItems();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openAdjustDialog(item: InventoryItem, type: "IN" | "OUT") {
    setAdjustItem(item);
    setAdjustType(type);
    setAdjustDialogOpen(true);
  }

  const lowStockCount = items.filter(
    (item) => item.currentQuantity <= item.minimumQuantity
  ).length;

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
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">총 품목</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}개</div>
          </CardContent>
        </Card>

        <Card className={lowStockCount > 0 ? "border-orange-200" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {lowStockCount > 0 && <AlertTriangle className="h-4 w-4 text-orange-500" />}
              재고 부족
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockCount > 0 ? "text-orange-600" : ""}`}>
              {lowStockCount}개
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">카테고리</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(items.map((i) => i.category)).size}개
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 및 추가 버튼 */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 카테고리</SelectItem>
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={showLowStock ? "default" : "outline"}
            size="sm"
            onClick={() => setShowLowStock(!showLowStock)}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            재고 부족만
          </Button>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              품목 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>품목 추가</DialogTitle>
              <DialogDescription>새로운 재고 품목을 등록합니다.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>품목명 *</Label>
                  <Input
                    placeholder="예: 복합비료"
                    value={newItem.name}
                    onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>카테고리</Label>
                  <Select
                    value={newItem.category}
                    onValueChange={(v) => setNewItem((p) => ({ ...p, category: v as keyof typeof CATEGORY_CONFIG }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-3">
                <div className="space-y-2">
                  <Label>현재 수량 *</Label>
                  <Input
                    type="number"
                    placeholder="10"
                    value={newItem.currentQuantity}
                    onChange={(e) => setNewItem((p) => ({ ...p, currentQuantity: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>단위 *</Label>
                  <Input
                    placeholder="kg, 포, 개"
                    value={newItem.unit}
                    onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>최소 수량</Label>
                  <Input
                    type="number"
                    placeholder="5"
                    value={newItem.minimumQuantity}
                    onChange={(e) => setNewItem((p) => ({ ...p, minimumQuantity: e.target.value }))}
                  />
                </div>
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

      {/* 재고 목록 */}
      {items.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>품목명</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead className="text-right">현재 수량</TableHead>
                  <TableHead className="text-right">최소 수량</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const categoryConfig = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.OTHER;
                  const isLowStock = item.currentQuantity <= item.minimumQuantity;
                  const stockRatio = item.minimumQuantity > 0
                    ? Math.min((item.currentQuantity / item.minimumQuantity) * 100, 100)
                    : 100;

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.name}
                        {item.location && (
                          <p className="text-xs text-muted-foreground">{item.location}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${categoryConfig.color}`}>
                          {categoryConfig.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.currentQuantity} {item.unit}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.minimumQuantity} {item.unit}
                      </TableCell>
                      <TableCell>
                        <div className="w-24">
                          <Progress
                            value={stockRatio}
                            className={`h-2 ${isLowStock ? "[&>div]:bg-orange-500" : ""}`}
                          />
                          {isLowStock && (
                            <span className="text-xs text-orange-600">재고 부족</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600"
                            onClick={() => openAdjustDialog(item, "IN")}
                          >
                            <ArrowUpCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600"
                            onClick={() => openAdjustDialog(item, "OUT")}
                          >
                            <ArrowDownCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500"
                            onClick={() => handleDeleteItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">등록된 재고 품목이 없습니다.</p>
          </CardContent>
        </Card>
      )}

      {/* 입출고 다이얼로그 */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustType === "IN" ? "입고 처리" : "출고 처리"}
            </DialogTitle>
            <DialogDescription>
              {adjustItem?.name}의 {adjustType === "IN" ? "입고" : "출고"} 수량을 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>수량 ({adjustItem?.unit})</Label>
              <Input
                type="number"
                placeholder="10"
                value={adjustQuantity}
                onChange={(e) => setAdjustQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>사유</Label>
              <Input
                placeholder={adjustType === "IN" ? "예: 구매" : "예: 사용"}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAdjustQuantity} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {adjustType === "IN" ? "입고" : "출고"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
