"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  BookOpen,
  Plus,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Thermometer,
  Droplets,
  CloudRain,
  Sun,
  Cloud,
  CloudSun,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import { blockNoteToPlainText } from "@/lib/utils/blocknote";
import { toast } from "sonner";

// BlockNote는 SSR 불가 — 클라이언트에서만 로드
const FarmingLogEditor = dynamic(() => import("./FarmingLogEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-40 items-center justify-center rounded-md border">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface FarmActivity {
  id: string;
  type: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  duration: number | null;
  workers: number | null;
  crop?: { id: string; name: string } | null;
}

interface FarmingLog {
  id: string;
  date: string;
  temperature: number | null;
  humidity: number | null;
  rainfall: number | null;
  weather: string | null;
  notes: string | null;
  content: string | null;
  activities: FarmActivity[];
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  SEEDING: "파종",
  TRANSPLANTING: "정식",
  WATERING: "관수",
  FERTILIZING: "시비",
  PEST_CONTROL: "병충해 방제",
  PRUNING: "전정",
  HARVESTING: "수확",
  PACKING: "포장",
  SHIPPING: "출하",
  MAINTENANCE: "시설 관리",
  OTHER: "기타",
};

const WEATHER_ICONS: Record<string, typeof Sun> = {
  맑음: Sun,
  흐림: Cloud,
  구름조금: CloudSun,
  비: CloudRain,
};

export function FarmingLogManager() {
  const [logs, setLogs] = useState<FarmingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // 일지 추가 다이얼로그
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newLog, setNewLog] = useState({
    date: new Date().toISOString().split("T")[0],
    temperature: "",
    humidity: "",
    rainfall: "",
    weather: "",
    notes: "",
  });
  const [newContent, setNewContent] = useState("");

  // 본문 열람 다이얼로그 (읽기 전용 에디터)
  const [viewingLog, setViewingLog] = useState<FarmingLog | null>(null);

  async function fetchLogs() {
    try {
      const response = await fetch(`/api/farm/logs?month=${currentMonth}`);
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [currentMonth]);

  function changeMonth(delta: number) {
    const [year, month] = currentMonth.split("-").map(Number);
    const newDate = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(
      `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}`
    );
  }

  async function handleAddLog() {
    if (!newLog.date) {
      toast.error("날짜를 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/farm/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newLog,
          temperature: newLog.temperature ? Number(newLog.temperature) : undefined,
          humidity: newLog.humidity ? Number(newLog.humidity) : undefined,
          rainfall: newLog.rainfall ? Number(newLog.rainfall) : undefined,
          // 빈 문서(문단만 있고 글자 없음)는 저장하지 않는다
          ...(blockNoteToPlainText(newContent) ? { content: newContent } : {}),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "등록에 실패했습니다.");
      } else {
        toast.success("영농일지가 등록되었습니다.");
        setIsAddDialogOpen(false);
        setNewLog({
          date: new Date().toISOString().split("T")[0],
          temperature: "",
          humidity: "",
          rainfall: "",
          weather: "",
          notes: "",
        });
        setNewContent("");
        fetchLogs();
      }
    } catch {
      toast.error("등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteLog(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/farm/logs/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "삭제에 실패했습니다.");
      } else {
        toast.success("일지가 삭제되었습니다.");
        fetchLogs();
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    }
  }

  const [currentYear, currentMonthNum] = currentMonth.split("-").map(Number);
  const monthName = `${currentYear}년 ${currentMonthNum}월`;

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
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">{monthName}</h2>
          <Button variant="outline" size="icon" onClick={() => changeMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              일지 작성
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>영농일지 작성</DialogTitle>
              <DialogDescription>
                오늘의 영농 활동을 기록합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input
                  type="date"
                  value={newLog.date}
                  onChange={(e) => setNewLog((p) => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>기온 (°C)</Label>
                  <Input
                    type="number"
                    placeholder="25"
                    value={newLog.temperature}
                    onChange={(e) => setNewLog((p) => ({ ...p, temperature: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>습도 (%)</Label>
                  <Input
                    type="number"
                    placeholder="60"
                    value={newLog.humidity}
                    onChange={(e) => setNewLog((p) => ({ ...p, humidity: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>강수량 (mm)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newLog.rainfall}
                    onChange={(e) => setNewLog((p) => ({ ...p, rainfall: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>날씨</Label>
                  <Select
                    value={newLog.weather}
                    onValueChange={(v) => setNewLog((p) => ({ ...p, weather: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="맑음">맑음</SelectItem>
                      <SelectItem value="구름조금">구름조금</SelectItem>
                      <SelectItem value="흐림">흐림</SelectItem>
                      <SelectItem value="비">비</SelectItem>
                      <SelectItem value="눈">눈</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>한 줄 요약</Label>
                <Textarea
                  placeholder="오늘의 특이사항..."
                  value={newLog.notes}
                  onChange={(e) => setNewLog((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>본문</Label>
                {isAddDialogOpen && (
                  <FarmingLogEditor onChange={setNewContent} />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddLog} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                등록
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 일지 목록 */}
      {logs.length > 0 ? (
        <div className="space-y-4">
          {logs.map((log) => {
            const WeatherIcon = WEATHER_ICONS[log.weather || ""] || Sun;
            return (
              <Card key={log.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">
                        {formatDate(log.date)}
                      </CardTitle>
                      {log.weather && (
                        <Badge variant="outline" className="gap-1">
                          <WeatherIcon className="h-3 w-3" />
                          {log.weather}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteLog(log.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* 날씨 정보 */}
                  <div className="flex gap-4 mb-3 text-sm text-muted-foreground">
                    {log.temperature !== null && (
                      <span className="flex items-center gap-1">
                        <Thermometer className="h-4 w-4" />
                        {log.temperature}°C
                      </span>
                    )}
                    {log.humidity !== null && (
                      <span className="flex items-center gap-1">
                        <Droplets className="h-4 w-4" />
                        {log.humidity}%
                      </span>
                    )}
                    {log.rainfall !== null && log.rainfall > 0 && (
                      <span className="flex items-center gap-1">
                        <CloudRain className="h-4 w-4" />
                        {log.rainfall}mm
                      </span>
                    )}
                  </div>

                  {/* 한 줄 요약 */}
                  {log.notes && (
                    <p className="text-sm mb-3">{log.notes}</p>
                  )}

                  {/* 본문 미리보기 (BlockNote 평문 추출) */}
                  {log.content && blockNoteToPlainText(log.content, 160) && (
                    <button
                      type="button"
                      onClick={() => setViewingLog(log)}
                      className="mb-3 block w-full rounded-md bg-muted/50 p-2 text-left text-sm text-muted-foreground hover:bg-muted"
                    >
                      {blockNoteToPlainText(log.content, 160)}
                      <span className="ml-1 text-xs text-primary">본문 보기</span>
                    </button>
                  )}

                  {/* 활동 목록 */}
                  {log.activities.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">작업 내역</p>
                      <div className="space-y-1">
                        {log.activities.map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded"
                          >
                            <Badge variant="secondary" className="text-xs">
                              {ACTIVITY_TYPE_LABELS[activity.type] || activity.type}
                            </Badge>
                            <span>{activity.description}</span>
                            {activity.crop && (
                              <Badge variant="outline" className="text-xs">
                                {activity.crop.name}
                              </Badge>
                            )}
                            {activity.quantity && (
                              <span className="text-muted-foreground">
                                ({activity.quantity}{activity.unit || ""})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">
              이 달에 작성된 일지가 없습니다.
            </p>
            <p className="text-sm text-muted-foreground">
              위의 &quot;일지 작성&quot; 버튼을 클릭해 새 일지를 등록하세요.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 본문 열람 (읽기 전용) */}
      <Dialog
        open={viewingLog !== null}
        onOpenChange={(open) => !open && setViewingLog(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewingLog ? `${formatDate(viewingLog.date)} 일지` : ""}
            </DialogTitle>
          </DialogHeader>
          {viewingLog?.content && (
            <FarmingLogEditor
              initialContent={viewingLog.content}
              editable={false}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
