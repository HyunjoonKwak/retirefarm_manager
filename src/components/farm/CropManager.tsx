"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Leaf,
  Plus,
  Loader2,
  Trash2,
  Calendar,
  Sprout,
} from "lucide-react";
import { formatDate, formatDDay } from "@/lib/utils/format";
import { toast } from "sonner";

interface Crop {
  id: string;
  name: string;
  variety: string | null;
  plantingDate: string;
  expectedHarvestDate: string;
  plotId: string | null;
  status: "GROWING" | "HARVESTING" | "COMPLETED" | "FAILED";
  growthStage: string;
  notes: string | null;
  /** 재배 종료일 — COMPLETED/FAILED 전이 시 서버 기록, 교정 가능 */
  completedAt: string | null;
  /** 레거시 종료 행: completedAt이 없어 보고서가 마지막 수정 시각으로 추정 */
  completedAtEstimated?: boolean;
  _count: {
    activities: number;
    transactions: number;
  };
}

const STATUS_CONFIG = {
  GROWING: { label: "재배중", color: "bg-green-100 text-green-800" },
  HARVESTING: { label: "수확중", color: "bg-yellow-100 text-yellow-800" },
  COMPLETED: { label: "완료", color: "bg-blue-100 text-blue-800" },
  FAILED: { label: "실패", color: "bg-red-100 text-red-800" },
};

const GROWTH_STAGE_CONFIG = {
  SEEDING: { label: "파종", progress: 0 },
  GERMINATION: { label: "발아", progress: 15 },
  SEEDLING: { label: "육묘", progress: 30 },
  VEGETATIVE: { label: "생장기", progress: 50 },
  FLOWERING: { label: "개화기", progress: 70 },
  FRUITING: { label: "결실기", progress: 85 },
  HARVEST: { label: "수확기", progress: 100 },
};

export function CropManager() {
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 작물 추가 다이얼로그
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCrop, setNewCrop] = useState({
    name: "",
    variety: "",
    plantingDate: new Date().toISOString().split("T")[0],
    expectedHarvestDate: "",
    notes: "",
  });

  async function fetchCrops() {
    try {
      const url = statusFilter === "all"
        ? "/api/farm/crops"
        : `/api/farm/crops?status=${statusFilter}`;
      const response = await fetch(url);
      const data = await response.json();
      setCrops(data.crops || []);
    } catch (error) {
      console.error("Failed to fetch crops:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchCrops();
  }, [statusFilter]);

  async function handleAddCrop() {
    if (!newCrop.name || !newCrop.plantingDate || !newCrop.expectedHarvestDate) {
      toast.error("필수 항목을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/farm/crops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCrop),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "등록에 실패했습니다.");
      } else {
        toast.success("작물이 등록되었습니다.");
        setIsAddDialogOpen(false);
        setNewCrop({
          name: "",
          variety: "",
          plantingDate: new Date().toISOString().split("T")[0],
          expectedHarvestDate: "",
          notes: "",
        });
        fetchCrops();
      }
    } catch {
      toast.error("등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteCrop(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/farm/crops/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "삭제에 실패했습니다.");
      } else {
        toast.success("작물이 삭제되었습니다.");
        fetchCrops();
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    }
  }

  async function handleUpdateStatus(id: string, status: string) {
    try {
      const response = await fetch(`/api/farm/crops/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "상태 변경에 실패했습니다.");
      } else {
        toast.success("상태가 변경되었습니다.");
        fetchCrops();
      }
    } catch {
      toast.error("상태 변경 중 오류가 발생했습니다.");
    }
  }

  async function handleUpdateCompletedAt(id: string, completedAt: string) {
    if (!completedAt) return;
    try {
      const response = await fetch(`/api/farm/crops/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedAt }),
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "완료일 변경에 실패했습니다.");
      } else {
        toast.success("완료일이 저장되었습니다.");
        fetchCrops();
      }
    } catch {
      toast.error("완료일 변경 중 오류가 발생했습니다.");
    }
  }

  async function handleUpdateGrowthStage(id: string, growthStage: string) {
    try {
      const response = await fetch(`/api/farm/crops/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ growthStage }),
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "생장단계 변경에 실패했습니다.");
      } else {
        toast.success("생장단계가 변경되었습니다.");
        fetchCrops();
      }
    } catch {
      toast.error("생장단계 변경 중 오류가 발생했습니다.");
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
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="GROWING">재배중</SelectItem>
            <SelectItem value="HARVESTING">수확중</SelectItem>
            <SelectItem value="COMPLETED">완료</SelectItem>
            <SelectItem value="FAILED">실패</SelectItem>
          </SelectContent>
        </Select>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              작물 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>작물 등록</DialogTitle>
              <DialogDescription>
                새로운 작물을 등록합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>작물명 *</Label>
                  <Input
                    placeholder="예: 딸기"
                    value={newCrop.name}
                    onChange={(e) => setNewCrop((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>품종</Label>
                  <Input
                    placeholder="예: 설향"
                    value={newCrop.variety}
                    onChange={(e) => setNewCrop((p) => ({ ...p, variety: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>파종일 *</Label>
                  <Input
                    type="date"
                    value={newCrop.plantingDate}
                    onChange={(e) => setNewCrop((p) => ({ ...p, plantingDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>예상 수확일 *</Label>
                  <Input
                    type="date"
                    value={newCrop.expectedHarvestDate}
                    onChange={(e) => setNewCrop((p) => ({ ...p, expectedHarvestDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>메모</Label>
                <Textarea
                  placeholder="작물 관련 메모..."
                  value={newCrop.notes}
                  onChange={(e) => setNewCrop((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddCrop} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                등록
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 작물 목록 */}
      {crops.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {crops.map((crop) => {
            const statusConfig = STATUS_CONFIG[crop.status];
            const growthConfig = GROWTH_STAGE_CONFIG[crop.growthStage as keyof typeof GROWTH_STAGE_CONFIG] || GROWTH_STAGE_CONFIG.SEEDING;
            const dDay = formatDDay(new Date(crop.expectedHarvestDate));

            return (
              <Card key={crop.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Sprout className="h-5 w-5 text-green-500" />
                        {crop.name}
                      </CardTitle>
                      {crop.variety && (
                        <CardDescription>{crop.variety}</CardDescription>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteCrop(crop.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 상태 */}
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-1 rounded text-xs ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                    <Select
                      value={crop.status}
                      onValueChange={(v) => handleUpdateStatus(crop.id, v)}
                    >
                      <SelectTrigger className="w-[100px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 생장 단계 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">생장 단계</span>
                      <Select
                        value={crop.growthStage}
                        onValueChange={(v) => handleUpdateGrowthStage(crop.id, v)}
                      >
                        <SelectTrigger className="w-[90px] h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(GROWTH_STAGE_CONFIG).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              {config.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Progress value={growthConfig.progress} className="h-2" />
                  </div>

                  {/* 날짜 정보 */}
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        파종일
                      </span>
                      <span>{formatDate(crop.plantingDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Leaf className="h-3 w-3" />
                        수확예정
                      </span>
                      <span className="flex items-center gap-2">
                        {formatDate(crop.expectedHarvestDate)}
                        <Badge variant="outline" className="text-xs">
                          {dDay}
                        </Badge>
                      </span>
                    </div>
                    {(crop.status === "COMPLETED" || crop.status === "FAILED") && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          완료일
                          {crop.completedAtEstimated && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              추정
                            </Badge>
                          )}
                        </span>
                        <Input
                          type="date"
                          className="h-7 w-[140px] text-xs"
                          value={crop.completedAt ? crop.completedAt.split("T")[0] : ""}
                          onChange={(e) => handleUpdateCompletedAt(crop.id, e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {/* 활동 수 */}
                  <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t">
                    <span>활동 {crop._count.activities}건</span>
                    <span>거래 {crop._count.transactions}건</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Leaf className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">
              등록된 작물이 없습니다.
            </p>
            <p className="text-sm text-muted-foreground">
              위의 &quot;작물 등록&quot; 버튼을 클릭해 새 작물을 등록하세요.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
