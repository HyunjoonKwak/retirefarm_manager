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
} from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import { toast } from "sonner";

interface MarketSettings {
  autoCollectEnabled: boolean;
  collectTime: string;
  collectDaysAgo: number;
  corporationCodes: string[];
  retentionDays: number;
  autoCleanupEnabled: boolean;
  defaultViewDays: number;
}

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

export function MarketSettings() {
  const [settings, setSettings] = useState<MarketSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<MarketSettings | null>(null);
  const [corporations, setCorporations] = useState<Corporation[]>([]);
  const [logs, setLogs] = useState<CollectionLog[]>([]);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

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

  function toggleCorporation(code: string) {
    if (!settings) return;

    const newCodes = settings.corporationCodes.includes(code)
      ? settings.corporationCodes.filter((c) => c !== code)
      : [...settings.corporationCodes, code];

    setSettings({ ...settings, corporationCodes: newCodes });
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
                  <div className="grid gap-4 md:grid-cols-2 pl-4 border-l-2">
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
