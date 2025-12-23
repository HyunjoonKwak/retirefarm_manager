"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Trash2,
  Database,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RotateCcw,
  AlertTriangle,
  Download,
  Play,
  Calendar,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface MarketSettings {
  autoCollectEnabled: boolean;
  collectTime: string;
  collectDaysAgo: number;
  collectDays: number[];
  corporationCodes: string[];
  targetProducts: string[];
  defaultViewDays: number;
}

// 요일 목록
const WEEKDAYS = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];

// 주요 품목 목록
const AVAILABLE_PRODUCTS = [
  "토마토", "포도", "딸기", "수박", "참외", "오이", "고추",
  "배추", "상추", "시금치", "양배추", "무", "당근",
  "감자", "고구마", "사과", "배", "감귤", "복숭아", "멜론",
];

interface Corporation {
  code: string;
  name: string;
  selected: boolean;
}

interface CollectionLog {
  id: string;
  targetDate: string;
  corporation: string;
  corporationName: string;
  totalCount: number;
  newCount: number;
  status: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

interface DailyData {
  date: string;
  count: number;
}

interface DataStats {
  totalCount: number;
  oldestDate: string | null;
  newestDate: string | null;
  dailyData: DailyData[];
}

export function MarketCollect() {
  const [settings, setSettings] = useState<MarketSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<MarketSettings | null>(null);
  const [corporations, setCorporations] = useState<Corporation[]>([]);
  const [logs, setLogs] = useState<CollectionLog[]>([]);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 수집 관련 상태 (수동/자동 통합)
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectProgress, setCollectProgress] = useState<string>("");
  const [collectProgressPercent, setCollectProgressPercent] = useState<number>(0);
  const [collectDate, setCollectDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [collectProducts, setCollectProducts] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("market_collectProducts");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [selectedCorps, setSelectedCorps] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("market_selectedCorps");
      return saved ? JSON.parse(saved) : ["11000101"];
    }
    return ["11000101"];
  });

  // 수집 품목 직접 입력
  const [customProduct, setCustomProduct] = useState<string>("");

  // 자동 수집 설정 펼침 상태
  const [autoSettingsOpen, setAutoSettingsOpen] = useState(false);

  // 삭제 관련 상태
  const [deleteTargetDate, setDeleteTargetDate] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // localStorage 동기화
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("market_collectProducts", JSON.stringify(collectProducts));
    }
  }, [collectProducts]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("market_selectedCorps", JSON.stringify(selectedCorps));
    }
  }, [selectedCorps]);

  // 변경사항 감지
  const hasUnsavedChanges = settings && originalSettings
    ? JSON.stringify(settings) !== JSON.stringify(originalSettings)
    : false;

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/market/garak/settings");
      const data = await response.json();
      setSettings(data.settings);
      setOriginalSettings(data.settings);
      setCorporations(data.availableCorporations || []);
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch("/api/market/garak/logs?days=14");
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  }, []);

  const fetchDataStats = useCallback(async () => {
    try {
      const response = await fetch("/api/market/garak/cleanup?byDate=true");
      const data = await response.json();
      setDataStats(data);
    } catch (error) {
      console.error("Failed to fetch data stats:", error);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchSettings(), fetchLogs(), fetchDataStats()]).finally(() =>
      setLoading(false)
    );
  }, [fetchSettings, fetchLogs, fetchDataStats]);

  async function handleSaveSettings() {
    if (!settings) return;

    setSaving(true);
    try {
      const response = await fetch("/api/market/garak/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "설정 저장에 실패했습니다.");
      } else {
        toast.success("설정이 저장되었습니다.");
        setOriginalSettings(settings);
      }
    } catch {
      toast.error("설정 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function handleResetSettings() {
    if (originalSettings) {
      setSettings(originalSettings);
      toast.info("변경사항이 취소되었습니다.");
    }
  }

  // 데이터 수집
  async function handleCollectData() {
    if (selectedCorps.length === 0) {
      toast.error("수집할 법인을 선택해주세요.");
      return;
    }

    setIsCollecting(true);
    setCollectProgress("수집 준비 중...");
    setCollectProgressPercent(0);

    const totalSteps = selectedCorps.length;
    let completedSteps = 0;
    let totalNewRecords = 0;

    try {
      for (const corpCode of selectedCorps) {
        const corpName = corporations.find((c) => c.code === corpCode)?.name || corpCode;
        setCollectProgress(`${corpName} 데이터 수집 중...`);

        const response = await fetch("/api/market/garak/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: collectDate,
            corporationCodes: [corpCode],
            productName: collectProducts.length > 0 ? collectProducts.join(",") : undefined,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `${corpName} 수집 실패`);
        }

        totalNewRecords += result.newRecords || 0;
        completedSteps++;
        setCollectProgressPercent(Math.round((completedSteps / totalSteps) * 100));
      }

      setCollectProgress("수집 완료!");
      toast.success(`${totalNewRecords}건의 새 데이터가 저장되었습니다.`);
      fetchDataStats();
      fetchLogs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "수집 중 오류가 발생했습니다.";
      setCollectProgress(`오류: ${message}`);
      toast.error(message);
    } finally {
      setTimeout(() => {
        setIsCollecting(false);
        setCollectProgress("");
        setCollectProgressPercent(0);
      }, 2000);
    }
  }

  // 특정 날짜 데이터 삭제
  async function handleDeleteDateData(date: string) {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/market/garak?date=${date}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "삭제 실패");
      }

      toast.success(`${formatDate(date)} 데이터 ${result.deletedCount}건이 삭제되었습니다.`);
      setDeleteTargetDate(null);
      fetchDataStats();
    } catch (error) {
      const message = error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }

  // 수집 품목 토글
  function toggleCollectProduct(product: string) {
    setCollectProducts((prev) =>
      prev.includes(product) ? prev.filter((p) => p !== product) : [...prev, product]
    );
  }

  // 수집 법인 토글
  function toggleCollectCorp(code: string) {
    setSelectedCorps((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  // 직접 입력 품목 추가
  function handleAddCustomProduct() {
    if (!customProduct.trim()) return;
    const products = customProduct.split(",").map((p) => p.trim()).filter(Boolean);
    setCollectProducts((prev) => [...new Set([...prev, ...products])]);
    setCustomProduct("");
  }

  function toggleCorporation(code: string) {
    if (!settings) return;

    const newCodes = settings.corporationCodes.includes(code)
      ? settings.corporationCodes.filter((c) => c !== code)
      : [...settings.corporationCodes, code];

    setSettings({ ...settings, corporationCodes: newCodes });
  }

  function toggleProduct(product: string) {
    if (!settings) return;

    const newProducts = settings.targetProducts.includes(product)
      ? settings.targetProducts.filter((p) => p !== product)
      : [...settings.targetProducts, product];

    setSettings({ ...settings, targetProducts: newProducts });
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "SUCCESS":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            성공
          </Badge>
        );
      case "FAILED":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            실패
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <AlertCircle className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
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
      {/* 데이터 수집 (수동/자동 통합) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            데이터 수집
          </CardTitle>
          <CardDescription>
            가락시장 경매 데이터를 수집합니다.
            {dataStats?.newestDate && (
              <span className="ml-2 text-primary font-medium">
                최신 데이터: {formatDate(dataStats.newestDate)}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 수집 날짜 */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              수집 날짜
            </Label>
            <Input
              type="date"
              value={collectDate}
              onChange={(e) => setCollectDate(e.target.value)}
              className="w-full md:w-64"
            />
          </div>

          {/* 수집 품목 선택 */}
          <div className="space-y-3">
            <Label>수집 품목 (선택하지 않으면 전체)</Label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_PRODUCTS.slice(0, 14).map((product) => (
                <Button
                  key={product}
                  variant={collectProducts.includes(product) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleCollectProduct(product)}
                >
                  {product}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="직접 입력 (쉼표로 구분)"
                value={customProduct}
                onChange={(e) => setCustomProduct(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustomProduct()}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleAddCustomProduct}>
                추가
              </Button>
            </div>
            {collectProducts.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {collectProducts.map((p) => (
                  <Badge
                    key={p}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => toggleCollectProduct(p)}
                  >
                    {p} ×
                  </Badge>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setCollectProducts([])}
                >
                  전체 해제
                </Button>
              </div>
            )}
          </div>

          {/* 법인 선택 */}
          <div className="space-y-3">
            <Label>수집 법인</Label>
            <div className="flex flex-wrap gap-2">
              {corporations.map((corp) => (
                <Button
                  key={corp.code}
                  variant={selectedCorps.includes(corp.code) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleCollectCorp(corp.code)}
                >
                  {corp.name}
                </Button>
              ))}
            </div>
          </div>

          {/* 수집 진행 상태 */}
          {isCollecting && (
            <div className="space-y-2 p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{collectProgress}</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${collectProgressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* 수집 버튼 */}
          <Button
            onClick={handleCollectData}
            disabled={isCollecting || selectedCorps.length === 0}
            size="lg"
            className="w-full md:w-auto"
          >
            {isCollecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            데이터 수집 시작
          </Button>

          {/* 자동 수집 설정 (접이식) */}
          {settings && (
            <Collapsible open={autoSettingsOpen} onOpenChange={setAutoSettingsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between mt-4 border-t pt-4">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    자동 수집 설정
                    {settings.autoCollectEnabled && (
                      <Badge variant="secondary" className="ml-2">
                        활성화됨 ({settings.collectTime})
                      </Badge>
                    )}
                  </span>
                  {autoSettingsOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">자동 수집</Label>
                    <p className="text-sm text-muted-foreground">
                      지정된 시간에 자동으로 데이터를 수집합니다.
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoCollectEnabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, autoCollectEnabled: checked })
                    }
                  />
                </div>

                {settings.autoCollectEnabled && (
                  <div className="space-y-4 pl-4 border-l-2">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>수집 시간</Label>
                        <Input
                          type="time"
                          value={settings.collectTime}
                          onChange={(e) =>
                            setSettings({ ...settings, collectTime: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>수집 대상</Label>
                        <Select
                          value={settings.collectDaysAgo.toString()}
                          onValueChange={(v) =>
                            setSettings({ ...settings, collectDaysAgo: parseInt(v, 10) })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">오늘 데이터</SelectItem>
                            <SelectItem value="1">어제 데이터</SelectItem>
                            <SelectItem value="2">2일 전 데이터</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* 수집 요일 선택 */}
                    <div className="space-y-2">
                      <Label>수집 요일</Label>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map((day) => (
                          <Button
                            key={day.value}
                            variant={settings.collectDays.includes(day.value) ? "default" : "outline"}
                            size="sm"
                            className="w-10"
                            onClick={() => {
                              const newDays = settings.collectDays.includes(day.value)
                                ? settings.collectDays.filter((d) => d !== day.value)
                                : [...settings.collectDays, day.value].sort((a, b) => a - b);
                              setSettings({ ...settings, collectDays: newDays });
                            }}
                          >
                            {day.label}
                          </Button>
                        ))}
                      </div>
                      {settings.collectDays.length === 0 && (
                        <p className="text-xs text-red-500">최소 1개 이상 선택해주세요.</p>
                      )}
                    </div>

                    {/* 수집 대상 법인 */}
                    <div className="space-y-3">
                      <Label>수집 대상 법인</Label>
                      <div className="flex flex-wrap gap-2">
                        {corporations.map((corp) => (
                          <Button
                            key={corp.code}
                            variant={settings.corporationCodes.includes(corp.code) ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleCorporation(corp.code)}
                          >
                            {corp.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* 수집 대상 품목 */}
                    <div className="space-y-3">
                      <div>
                        <Label>수집 대상 품목</Label>
                        <p className="text-sm text-muted-foreground">
                          선택하지 않으면 전체 품목을 수집합니다.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABLE_PRODUCTS.map((product) => (
                          <Button
                            key={product}
                            variant={settings.targetProducts.includes(product) ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleProduct(product)}
                          >
                            {product}
                          </Button>
                        ))}
                      </div>
                      {settings.targetProducts.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          선택됨: {settings.targetProducts.join(", ")}
                        </p>
                      )}
                    </div>

                    {/* 법인 선택 경고 */}
                    {settings.corporationCodes.length === 0 && (
                      <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        수집 대상 법인을 최소 1개 이상 선택해주세요.
                      </div>
                    )}
                  </div>
                )}

                {/* 저장/취소 버튼 */}
                <div className="flex items-center justify-between pt-4">
                  <div className="flex items-center gap-2">
                    {hasUnsavedChanges && (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        저장되지 않은 변경사항
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {hasUnsavedChanges && (
                      <Button variant="outline" onClick={handleResetSettings}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        취소
                      </Button>
                    )}
                    <Button
                      onClick={handleSaveSettings}
                      disabled={saving || (settings.autoCollectEnabled && settings.corporationCodes.length === 0)}
                    >
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      설정 저장
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* 저장된 데이터 현황 (날짜별) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            저장된 데이터
          </CardTitle>
          <CardDescription>
            날짜별로 저장된 시세 데이터 현황입니다.
            {dataStats && (
              <span className="ml-2">
                총 {dataStats.totalCount.toLocaleString()}건
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dataStats?.dailyData && dataStats.dailyData.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead className="text-right">데이터 건수</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataStats.dailyData.map((item) => (
                    <TableRow key={item.date}>
                      <TableCell className="font-medium">
                        {formatDate(item.date)}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.count.toLocaleString()}건
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTargetDate(item.date)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              저장된 데이터가 없습니다.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 수집 로그 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            수집 로그
          </CardTitle>
          <CardDescription>
            최근 14일간의 데이터 수집 기록입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>수집일시</TableHead>
                  <TableHead>대상 날짜</TableHead>
                  <TableHead>법인</TableHead>
                  <TableHead className="text-right">조회/저장</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.slice(0, 20).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {formatDate(log.startedAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(log.targetDate)}
                    </TableCell>
                    <TableCell>{log.corporationName}</TableCell>
                    <TableCell className="text-right">
                      {log.totalCount.toLocaleString()} / {log.newCount.toLocaleString()}
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              수집 로그가 없습니다.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteTargetDate} onOpenChange={() => setDeleteTargetDate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>데이터 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetDate && formatDate(deleteTargetDate)} 날짜의 모든 데이터를 삭제합니다.
              삭제된 데이터는 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTargetDate && handleDeleteDateData(deleteTargetDate)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
