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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Settings,
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
} from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import { toast } from "sonner";

interface MarketSettings {
  autoCollectEnabled: boolean;
  collectTime: string;
  collectDaysAgo: number;
  collectDays: number[]; // 0=일, 1=월, ..., 6=토
  corporationCodes: string[];
  targetProducts: string[];
  retentionDays: number;
  autoCleanupEnabled: boolean;
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

interface DataStats {
  totalCount: number;
  oldestDate: string | null;
  newestDate: string | null;
  retentionBreakdown: {
    within30Days: number;
    within60Days: number;
    within90Days: number;
    over90Days: number;
  };
}

export function MarketCollect() {
  const [settings, setSettings] = useState<MarketSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<MarketSettings | null>(null);
  const [corporations, setCorporations] = useState<Corporation[]>([]);
  const [logs, setLogs] = useState<CollectionLog[]>([]);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  // 수동 수집 관련 상태
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

  // 데이터 삭제 관련 상태
  const [deleteDate, setDeleteDate] = useState<string>("");
  const [deleteProduct, setDeleteProduct] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // 수집 품목 직접 입력
  const [customProduct, setCustomProduct] = useState<string>("");

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
      const response = await fetch("/api/market/garak/cleanup");
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

  async function handleCleanup(retentionDays: number) {
    setCleaning(true);
    try {
      const response = await fetch("/api/market/garak/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "데이터 정리에 실패했습니다.");
      } else {
        toast.success(result.message);
        fetchDataStats();
      }
    } catch {
      toast.error("데이터 정리 중 오류가 발생했습니다.");
    } finally {
      setCleaning(false);
    }
  }

  // 수동 데이터 수집
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

        const params = new URLSearchParams({
          date: collectDate,
          corporation: corpCode,
        });

        if (collectProducts.length > 0) {
          params.append("products", collectProducts.join(","));
        }

        const response = await fetch(`/api/market/garak?${params.toString()}`);
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

  // 특정 날짜/품목 데이터 삭제
  async function handleDeleteDateData() {
    if (!deleteDate) {
      toast.error("삭제할 날짜를 선택해주세요.");
      return;
    }

    setIsDeleting(true);
    try {
      const params = new URLSearchParams({
        date: deleteDate,
      });
      if (deleteProduct) {
        params.append("product", deleteProduct);
      }

      const response = await fetch(`/api/market/garak/delete?${params.toString()}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "삭제 실패");
      }

      toast.success(result.message || "데이터가 삭제되었습니다.");
      setDeleteDate("");
      setDeleteProduct("");
      setDeleteConfirmOpen(false);
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
      {/* 수동 데이터 수집 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            수동 데이터 수집
          </CardTitle>
          <CardDescription>
            가락시장 경매 데이터를 수동으로 수집합니다.
            {dataStats?.newestDate && (
              <span className="ml-2 text-primary">
                최신 데이터: {formatDate(dataStats.newestDate)}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 수집 날짜 */}
          <div className="space-y-2">
            <Label>수집 날짜</Label>
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
            className="w-full md:w-auto"
          >
            {isCollecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            데이터 수집 시작
          </Button>
        </CardContent>
      </Card>

      {/* 데이터 삭제 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            데이터 삭제
          </CardTitle>
          <CardDescription>
            특정 날짜 또는 품목의 데이터를 삭제합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>삭제할 날짜</Label>
              <Input
                type="date"
                value={deleteDate}
                onChange={(e) => setDeleteDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>품목 (선택)</Label>
              <Input
                placeholder="비워두면 해당 날짜 전체 삭제"
                value={deleteProduct}
                onChange={(e) => setDeleteProduct(e.target.value)}
              />
            </div>
          </div>
          <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={!deleteDate || isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                데이터 삭제
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>데이터 삭제 확인</AlertDialogTitle>
                <AlertDialogDescription>
                  {formatDate(deleteDate)}
                  {deleteProduct ? ` "${deleteProduct}" 품목` : " 전체"} 데이터를 삭제합니다.
                  삭제된 데이터는 복구할 수 없습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteDateData}>
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* 수집 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            수집 설정
          </CardTitle>
          <CardDescription>
            가락시장 경매 데이터 수집 및 보관 설정을 관리합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {settings && (
            <>
              {/* 자동 수집 설정 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">자동 수집</Label>
                    <p className="text-sm text-muted-foreground">
                      매일 지정된 시간에 자동으로 데이터를 수집합니다.
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
                            <SelectItem value="1">어제 데이터</SelectItem>
                            <SelectItem value="2">2일 전 데이터</SelectItem>
                            <SelectItem value="3">3일 전 데이터</SelectItem>
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
                      <p className="text-xs text-muted-foreground">
                        선택한 요일에만 자동 수집이 실행됩니다.
                        {settings.collectDays.length === 0 && (
                          <span className="text-red-500 ml-1">최소 1개 이상 선택해주세요.</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 수집 대상 법인 */}
              <div className="space-y-3">
                <Label className="text-base">수집 대상 법인</Label>
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
                  <Label className="text-base">수집 대상 품목</Label>
                  <p className="text-sm text-muted-foreground">
                    자동 수집할 품목을 선택하세요. 선택하지 않으면 전체 품목을 수집합니다.
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

              {/* 데이터 보관 설정 */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">자동 정리</Label>
                    <p className="text-sm text-muted-foreground">
                      보관 기간이 지난 데이터를 자동으로 삭제합니다.
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoCleanupEnabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, autoCleanupEnabled: checked })
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>보관 기간</Label>
                    <Select
                      value={settings.retentionDays.toString()}
                      onValueChange={(v) =>
                        setSettings({ ...settings, retentionDays: parseInt(v, 10) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30일</SelectItem>
                        <SelectItem value="60">60일</SelectItem>
                        <SelectItem value="90">90일</SelectItem>
                        <SelectItem value="180">180일</SelectItem>
                        <SelectItem value="365">365일</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>기본 조회 기간</Label>
                    <Select
                      value={settings.defaultViewDays.toString()}
                      onValueChange={(v) =>
                        setSettings({ ...settings, defaultViewDays: parseInt(v, 10) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7일</SelectItem>
                        <SelectItem value="14">14일</SelectItem>
                        <SelectItem value="30">30일</SelectItem>
                        <SelectItem value="60">60일</SelectItem>
                        <SelectItem value="90">90일</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* 법인 선택 경고 */}
              {settings.corporationCodes.length === 0 && (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  수집 대상 법인을 최소 1개 이상 선택해주세요.
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
                    disabled={saving || settings.corporationCodes.length === 0}
                  >
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    설정 저장
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 데이터 현황 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            데이터 현황
          </CardTitle>
          <CardDescription>
            저장된 시세 데이터 현황 및 관리
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dataStats && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">전체 데이터</p>
                  <p className="text-2xl font-bold">{dataStats.totalCount.toLocaleString()}건</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">30일 이내</p>
                  <p className="text-2xl font-bold text-green-600">
                    {dataStats.retentionBreakdown.within30Days.toLocaleString()}건
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">30-90일</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {(dataStats.retentionBreakdown.within60Days + dataStats.retentionBreakdown.within90Days).toLocaleString()}건
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">90일 초과</p>
                  <p className="text-2xl font-bold text-red-600">
                    {dataStats.retentionBreakdown.over90Days.toLocaleString()}건
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  데이터 기간: {dataStats.oldestDate ? formatDate(dataStats.oldestDate) : "-"} ~{" "}
                  {dataStats.newestDate ? formatDate(dataStats.newestDate) : "-"}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={cleaning}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      오래된 데이터 정리
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>데이터 정리</AlertDialogTitle>
                      <AlertDialogDescription>
                        {settings?.retentionDays || 90}일 이전의 데이터를 삭제합니다.
                        삭제된 데이터는 복구할 수 없습니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleCleanup(settings?.retentionDays || 90)}
                      >
                        삭제
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
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
    </div>
  );
}
