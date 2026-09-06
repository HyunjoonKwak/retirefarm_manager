"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Database, Download, Trash2, RotateCcw, Loader2, Calendar, Clock, Save } from "lucide-react";
import { formatDate } from "@/lib/utils/format";

interface Backup {
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
}

interface BackupSchedule {
  enabled: boolean;
  dayOfWeek: number;
  hour: number;
  minute: number;
  retentionDays: number;
}

const DAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

export function BackupManager() {
  const [pendingRestore, setPendingRestore] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule>({
    enabled: true,
    dayOfWeek: 0,
    hour: 2,
    minute: 0,
    retentionDays: 30,
  });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 백업 목록 조회
  const fetchBackups = async () => {
    try {
      const response = await fetch("/api/backup");
      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups || []);
        setPendingRestore(Boolean(data.pendingRestore));
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "백업 목록을 불러오지 못했습니다." });
      }
    } catch (error) {
      console.error("Failed to fetch backups:", error);
    }
  };

  // 스케줄 조회
  const fetchSchedule = async () => {
    try {
      const response = await fetch("/api/backup/schedule");
      if (response.ok) {
        const data = await response.json();
        setSchedule(data.schedule);
        if (!data.schedulerRunning) setMessage({ type: "error", text: "자동 백업 실행기가 동작하지 않습니다. 앱을 재시작해 주세요." });
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "백업 스케줄을 불러오지 못했습니다." });
      }
    } catch (error) {
      console.error("Failed to fetch schedule:", error);
    }
  };

  useEffect(() => {
    Promise.all([fetchBackups(), fetchSchedule()]).finally(() => setLoading(false));
  }, []);

  // 수동 백업 생성
  const createBackup = async () => {
    try {
      setCreating(true);
      setMessage(null);
      const response = await fetch("/api/backup", { method: "POST" });
      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: "백업이 생성되었습니다." });
        fetchBackups();
      } else {
        setMessage({ type: "error", text: data.error || "백업 생성에 실패했습니다." });
      }
    } catch {
      setMessage({ type: "error", text: "백업 생성 중 오류가 발생했습니다." });
    } finally {
      setCreating(false);
    }
  };

  // 백업 복원
  const restoreBackup = async (filename: string) => {
    try {
      setRestoring(filename);
      setMessage(null);
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage({
          type: "success",
          text: data.message,
        });
        fetchBackups();
      } else {
        setMessage({ type: "error", text: data.error || "복원에 실패했습니다." });
      }
    } catch {
      setMessage({ type: "error", text: "복원 중 오류가 발생했습니다." });
    } finally {
      setRestoring(null);
    }
  };

  // 백업 삭제
  const deleteBackup = async (filename: string) => {
    try {
      setMessage(null);
      const response = await fetch(`/api/backup?filename=${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setMessage({ type: "success", text: "백업이 삭제되었습니다." });
        fetchBackups();
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "삭제에 실패했습니다." });
      }
    } catch {
      setMessage({ type: "error", text: "삭제 중 오류가 발생했습니다." });
    }
  };

  // 백업 다운로드
  const downloadBackup = (filename: string) => {
    window.open(`/api/backup/download?filename=${encodeURIComponent(filename)}`, "_blank");
  };

  // 스케줄 저장
  const saveSchedule = async () => {
    try {
      setSavingSchedule(true);
      setMessage(null);
      const response = await fetch("/api/backup/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage({ type: data.schedulerRunning ? "success" : "error", text: data.message });
      } else {
        setMessage({ type: "error", text: data.error || "스케줄 저장에 실패했습니다." });
      }
    } catch {
      setMessage({ type: "error", text: "스케줄 저장 중 오류가 발생했습니다." });
    } finally {
      setSavingSchedule(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 알림 메시지 */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {pendingRestore && (
        <div className="rounded-lg border p-4 space-y-2">
          <p>복원이 예약되어 있습니다. 앱 재시작 시 적용됩니다. 재시작 전까지 추가한 데이터는 복원본에 포함되지 않으며 별도 안전 백업으로 보존됩니다.</p>
          <Button variant="outline" onClick={async () => {
            try {
              const response = await fetch("/api/backup/restore", { method: "DELETE" });
              const data = await response.json();
              setMessage({ type: response.ok ? "success" : "error", text: data.message || data.error });
              await fetchBackups();
            } catch { setMessage({ type: "error", text: "복원 예약 취소에 실패했습니다." }); }
          }}>복원 예약 취소</Button>
        </div>
      )}

      {/* 스케줄 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            자동 백업 스케줄
          </CardTitle>
          <CardDescription>한국 시간 기준으로 실행합니다. 앱이 실행 중일 때 매분 최신 설정을 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>자동 백업 활성화</Label>
              <p className="text-sm text-muted-foreground">설정된 시간에 자동으로 백업합니다.</p>
            </div>
            <Switch
              checked={schedule.enabled}
              onCheckedChange={(checked) => setSchedule({ ...schedule, enabled: checked })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>요일</Label>
              <Select
                value={schedule.dayOfWeek.toString()}
                onValueChange={(value) => setSchedule({ ...schedule, dayOfWeek: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((day, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>시간</Label>
              <Select
                value={schedule.hour.toString()}
                onValueChange={(value) => setSchedule({ ...schedule, hour: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      {i.toString().padStart(2, "0")}시
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>분</Label>
              <Select
                value={schedule.minute.toString()}
                onValueChange={(value) => setSchedule({ ...schedule, minute: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 15, 30, 45].map((m) => (
                    <SelectItem key={m} value={m.toString()}>
                      {m.toString().padStart(2, "0")}분
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>보관 일수</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={schedule.retentionDays}
                onChange={(e) =>
                  setSchedule({ ...schedule, retentionDays: parseInt(e.target.value) || 30 })
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {schedule.enabled
                ? `매주 ${DAY_NAMES[schedule.dayOfWeek]} ${schedule.hour
                    .toString()
                    .padStart(2, "0")}:${schedule.minute.toString().padStart(2, "0")}에 백업, ${
                    schedule.retentionDays
                  }일 보관`
                : "자동 백업 비활성화됨"}
            </span>
          </div>

          <Button onClick={saveSchedule} disabled={savingSchedule}>
            {savingSchedule && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            스케줄 저장
          </Button>
        </CardContent>
      </Card>

      {/* 백업 목록 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              백업 목록
            </CardTitle>
            <CardDescription>생성된 백업 파일을 관리합니다.</CardDescription>
          </div>
          <Button onClick={createBackup} disabled={creating}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Database className="mr-2 h-4 w-4" />
            지금 백업
          </Button>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              백업 파일이 없습니다. &quot;지금 백업&quot; 버튼을 눌러 백업을 생성하세요.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>파일명</TableHead>
                  <TableHead>크기</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((backup) => (
                  <TableRow key={backup.filename}>
                    <TableCell className="font-mono text-sm">{backup.filename}</TableCell>
                    <TableCell>{backup.sizeFormatted}</TableCell>
                    <TableCell>{formatDate(backup.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadBackup(backup.filename)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>백업 복원</AlertDialogTitle>
                              <AlertDialogDescription>
                                이 백업으로 복원을 예약하시겠습니까?
                                <br />
                                <strong>앱 재시작 시 현재 데이터가 모두 교체됩니다.</strong>
                                <br />
                                재시작 직전 안전 백업에 성공한 경우에만 복원합니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => restoreBackup(backup.filename)}
                                disabled={pendingRestore || restoring === backup.filename}
                              >
                                {restoring === backup.filename && (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                복원
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>백업 삭제</AlertDialogTitle>
                              <AlertDialogDescription>
                                이 백업 파일을 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteBackup(backup.filename)}
                                className="bg-red-500 hover:bg-red-600"
                              >
                                삭제
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
