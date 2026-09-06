"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";

/** GET /api/market/garak/recovery 응답 계약 */
export interface RecoveryJob {
  id: string;
  /** 수집 대상 날짜 (YYYY-MM-DD). 시간대 변환 없이 그대로 보여준다 */
  targetDate: string;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface RecoveryStatus {
  enabled: boolean;
  lookbackDays: number;
  checkIntervalMinutes: number;
  graceMinutes: number;
  schedulerReady: boolean;
  lastCheckedAt: string | null;
  checking: boolean;
  lastCheckOk?: boolean | null;
  maxAttempts?: number;
  summary: { pending: number; running: number; failed: number };
  jobs: RecoveryJob[];
}

/** 날짜별 보충 시도 상한 (백엔드와 같은 값, 안내 문구용) */
const MAX_ATTEMPTS = 3;
/** 화면이 열려 있을 때만 이 간격으로 다시 조회한다 */
const POLL_INTERVAL_MS = 60_000;
/** 목록에 보여줄 최신 결과 수 */
const VISIBLE_JOBS = 5;

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "대기", className: "bg-slate-100 text-slate-700" },
  RUNNING: { label: "진행 중", className: "bg-blue-100 text-blue-800" },
  SUCCESS: { label: "완료", className: "bg-green-100 text-green-800" },
  EMPTY: { label: "거래 없음", className: "bg-gray-100 text-gray-700" },
  PARTIAL: { label: "일부 수집", className: "bg-amber-100 text-amber-800" },
  FAILED: { label: "실패", className: "bg-red-100 text-red-800" },
  CANCELLED: { label: "취소됨", className: "bg-gray-100 text-gray-600" },
};

function statusBadge(status: string) {
  const config = STATUS_LABELS[status];
  if (!config) {
    return <Badge variant="secondary">{status}</Badge>;
  }
  return <Badge variant="secondary" className={config.className}>{config.label}</Badge>;
}

/** 시각(ISO)을 사람이 읽는 형태로. 대상 날짜(YYYY-MM-DD)에는 쓰지 않는다. */
function formatMoment(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface MarketRecoveryStatusProps {
  /** 테스트·수동 갱신용. 지정하지 않으면 60초마다 자동 갱신 */
  pollIntervalMs?: number;
}

export function MarketRecoveryStatus({ pollIntervalMs = POLL_INTERVAL_MS }: MarketRecoveryStatusProps) {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 진행 중 요청은 하나만 두고, 언마운트·재조회 시 취소한다
  const controllerRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/api/market/garak/recovery", { signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted) return;

      if (!response.ok || !data || typeof data.enabled !== "boolean" || !Array.isArray(data.jobs)) {
        // 조회 실패를 "정상"으로 보여주지 않는다
        setError(data?.error || `상태를 불러오지 못했습니다 (HTTP ${response.status})`);
        return;
      }
      setStatus(data as RecoveryStatus);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "상태를 불러오지 못했습니다");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => controllerRef.current?.abort();
  }, [fetchStatus]);

  // 화면이 열려 있을 때만 주기 조회한다 (백그라운드 탭에서는 호출하지 않음)
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") fetchStatus();
    };
    const timer = setInterval(tick, pollIntervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fetchStatus, pollIntervalMs]);

  const jobs = status ? [...status.jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  const visibleJobs = jobs.slice(0, VISIBLE_JOBS);
  const nextAttempt = jobs
    .map((job) => job.nextAttemptAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
              자동 보충 상태
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {status
                ? `최근 ${status.lookbackDays}일의 예약분 중 수집 기록이 없거나 실패한 날을 보충합니다. 예정 시각에서 ${status.graceMinutes}분이 지난 날짜가 대상이며, ${status.checkIntervalMinutes}분마다 확인하고 날짜마다 최대 ${status.maxAttempts ?? MAX_ATTEMPTS}번까지 시도합니다.`
                : "수집이 빠진 날짜를 자동으로 다시 모으는 기능입니다."}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchStatus}
            disabled={loading}
            aria-label="상태 새로고침"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-2" role="alert">
            <p className="flex items-center gap-2">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              자동 보충 상태를 확인하지 못했습니다. {error}
            </p>
            <Button variant="outline" size="sm" className="h-7" onClick={fetchStatus} disabled={loading}>
              다시 조회
            </Button>
          </div>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">
            {loading ? "상태를 불러오는 중입니다." : "표시할 상태가 없습니다."}
          </p>
        ) : (
          <>
            {!status.enabled && (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                자동 보충이 꺼져 있습니다. 빠진 날짜는 위에서 직접 수집해 주세요.
              </p>
            )}

            {!status.schedulerReady && (
              <p
                className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                role="status"
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                자동 수집 준비가 끝나지 않아 보충이 미뤄질 수 있습니다. 서버를 다시 시작하거나 수집 설정을 확인해 주세요.
              </p>
            )}
            {status.lastCheckOk === false && <p role="alert" className="text-sm text-amber-700">최근 자동 점검에 실패했습니다. 다음 점검에서 다시 확인합니다.</p>}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                대기 {status.summary.pending} · 진행 중 {status.summary.running} · 실패 {status.summary.failed}
              </span>
              <span>마지막 확인 {formatMoment(status.lastCheckedAt)}</span>
              {status.checking && (
                <span className="flex items-center gap-1 text-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> 확인 중
                </span>
              )}
            </div>

            {visibleJobs.length > 0 ? (
              <>
                <ul className="space-y-2">
                  {visibleJobs.map((job) => (
                    <li
                      key={job.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {/* 대상 날짜는 응답 값 그대로 (시간대 변환 없음) */}
                        <span className="font-medium">{job.targetDate}</span>
                        {statusBadge(job.status)}
                        <span className="text-xs text-muted-foreground">
                          {job.attempts}/{status.maxAttempts ?? MAX_ATTEMPTS}회 시도
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {job.nextAttemptAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            다음 시도 {formatMoment(job.nextAttemptAt)}
                          </span>
                        )}
                        <span>{formatMoment(job.updatedAt)}</span>
                      </div>
                      {job.lastError && (
                        <p className="w-full text-xs text-red-700 break-words">{job.lastError}</p>
                      )}
                    </li>
                  ))}
                </ul>
                {jobs.length > visibleJobs.length && (
                  <p className="text-xs text-muted-foreground">
                    최근 {visibleJobs.length}건만 표시했습니다. (전체 {jobs.length}건)
                  </p>
                )}
                {nextAttempt && (
                  <p className="text-xs text-muted-foreground">
                    다음 보충 예정 {formatMoment(nextAttempt)}
                  </p>
                )}
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                {status.enabled && status.lastCheckOk === true ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <CircleDashed className="h-4 w-4" />
                )}
                표시할 자동 보충 작업이 없습니다. 마지막 점검 시각과 수집 로그를 함께 확인해 주세요.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
