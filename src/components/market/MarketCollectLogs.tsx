"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, CheckCircle, XCircle, AlertCircle, AlertTriangle, CircleDashed } from "lucide-react";
import { formatDate } from "@/lib/utils/format";

interface CollectionLog {
  id: string;
  targetDate: string;
  corporation: string;
  corporationName: string;
  targetProducts: string | null;
  totalCount: number;
  newCount: number;
  duplicateCount: number;
  status: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

interface MarketCollectLogsProps {
  logs: CollectionLog[];
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
    case "PARTIAL":
      return (
        <Badge variant="secondary" className="bg-amber-500 text-white">
          <AlertTriangle className="h-3 w-3 mr-1" />
          일부 수집
        </Badge>
      );
    case "EMPTY":
    case "NO_AUCTION":
      // 예전 NO_AUCTION 로그도 "0건"일 뿐 휴장 확정이 아니다 (HTML/오류 응답을 0건으로 읽었을 수 있음)
      return (
        <Badge variant="secondary" className="bg-gray-400 text-white">
          <CircleDashed className="h-3 w-3 mr-1" />
          0건
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

export function MarketCollectLogs({ logs }: MarketCollectLogsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
          수집 로그
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          최근 14일간 수집 기록 (조회: API에서 가져온 건수 / 저장: 신규 저장 건수 / 중복: 이미 있던 건수).
          일부 수집·실패는 상태에 마우스를 올리면 원인이 보이며, 같은 조건으로 다시 수집하면 누락분이 채워집니다.
          0건은 휴장 확정이 아닙니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length > 0 ? (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">수집시간</TableHead>
                  <TableHead className="whitespace-nowrap hidden sm:table-cell">대상일</TableHead>
                  <TableHead className="whitespace-nowrap hidden lg:table-cell">품목</TableHead>
                  <TableHead className="whitespace-nowrap hidden md:table-cell">법인</TableHead>
                  <TableHead className="text-right whitespace-nowrap">조회/저장/중복</TableHead>
                  <TableHead className="whitespace-nowrap">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.slice(0, 20).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">
                      {new Date(log.startedAt).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm hidden sm:table-cell whitespace-nowrap">
                      {formatDate(log.targetDate)}
                    </TableCell>
                    <TableCell
                      className="text-xs sm:text-sm hidden lg:table-cell max-w-[100px] truncate"
                      title={log.targetProducts || "전체"}
                    >
                      {log.targetProducts || "전체"}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm hidden md:table-cell">
                      {log.corporationName}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm whitespace-nowrap">
                      <span className="text-muted-foreground">{log.totalCount.toLocaleString()}</span>
                      {" / "}
                      <span className="text-green-600 font-medium">{log.newCount.toLocaleString()}</span>
                      {" / "}
                      <span className="text-orange-500">{(log.duplicateCount || 0).toLocaleString()}</span>
                    </TableCell>
                    <TableCell>
                      <span title={log.errorMessage || undefined} className="inline-flex flex-col gap-0.5">
                        {getStatusBadge(log.status)}
                        {log.errorMessage && (log.status === "PARTIAL" || log.status === "FAILED") && (
                          <span className="text-[10px] text-muted-foreground max-w-[180px] truncate">
                            {log.errorMessage}
                          </span>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            수집 로그가 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
