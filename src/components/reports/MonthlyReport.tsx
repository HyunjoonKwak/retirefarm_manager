"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Wallet,
  Leaf,
  Package,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";

interface MonthlyReportData {
  period: {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
  };
  finance: {
    income: string;
    expense: string;
    profit: string;
    incomeChange: number;
    expenseChange: number;
    profitMargin: number;
    transactionCount: number;
    incomeByCategory: Array<{ category: string; amount: string }>;
    expenseByCategory: Array<{ category: string; amount: string }>;
    incomeByCrop: Array<{ crop: string; amount: string }>;
  };
  farming: {
    logCount: number;
    activityCount: number;
    activitySummary: Record<string, number>;
    totalWorkHours: number;
  };
  crops: {
    growing: number;
    harvesting: number;
    completed: number;
    failed: number;
  };
  inventory: {
    inCount: number;
    outCount: number;
    transactionCount: number;
  };
  daily: Array<{ day: number; income: string; expense: string }>;
}

const ACTIVITY_LABELS: Record<string, string> = {
  SEEDING: "파종",
  TRANSPLANTING: "정식",
  WATERING: "관수",
  FERTILIZING: "시비",
  PEST_CONTROL: "방제",
  PRUNING: "전지",
  HARVESTING: "수확",
  PACKING: "포장",
  SHIPPING: "출하",
  MAINTENANCE: "시설관리",
  OTHER: "기타",
};

const MONTHS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월"
];

export function MonthlyReport() {
  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  async function fetchReport() {
    setLoading(true);
    try {
      const response = await fetch(`/api/reports/monthly?year=${year}&month=${month}`);
      const result = await response.json();
      if (response.ok) {
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch report:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReport();
  }, [year, month]);

  function prevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  }

  function exportReport() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monthly_report_${year}_${month}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth() + 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        데이터를 불러올 수 없습니다.
      </div>
    );
  }

  const profit = Number(data.finance.profit);
  const maxDailyValue = Math.max(
    ...data.daily.map((d) => Math.max(Number(d.income), Number(d.expense)))
  );

  return (
    <div className="space-y-6">
      {/* 기간 선택 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
              <SelectTrigger className="w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={nextMonth} disabled={isCurrentMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" onClick={exportReport}>
          <Download className="mr-2 h-4 w-4" />
          내보내기
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              총 수입
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatLargeNumber(data.finance.income)}
            </div>
            {data.finance.incomeChange !== 0 && (
              <p className={`text-xs flex items-center gap-1 mt-1 ${data.finance.incomeChange > 0 ? "text-green-600" : "text-red-600"}`}>
                {data.finance.incomeChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                전월 대비 {Math.abs(data.finance.incomeChange)}%
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              총 지출
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatLargeNumber(data.finance.expense)}
            </div>
            {data.finance.expenseChange !== 0 && (
              <p className={`text-xs flex items-center gap-1 mt-1 ${data.finance.expenseChange > 0 ? "text-red-600" : "text-green-600"}`}>
                {data.finance.expenseChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                전월 대비 {Math.abs(data.finance.expenseChange)}%
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              순이익
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profit >= 0 ? "text-blue-600" : "text-red-600"}`}>
              {profit >= 0 ? "+" : ""}{formatLargeNumber(data.finance.profit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              수익률 {data.finance.profitMargin}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-orange-500" />
              영농 활동
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.farming.activityCount}건</div>
            <p className="text-xs text-muted-foreground mt-1">
              총 {data.farming.totalWorkHours}시간 작업
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 상세 분석 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 수입 분석 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">수입 분석</CardTitle>
            <CardDescription>카테고리별 수입 현황</CardDescription>
          </CardHeader>
          <CardContent>
            {data.finance.incomeByCategory.length > 0 ? (
              <div className="space-y-3">
                {data.finance.incomeByCategory.map((item) => {
                  const percentage = Number(data.finance.income) > 0
                    ? (Number(item.amount) / Number(data.finance.income)) * 100
                    : 0;
                  return (
                    <div key={item.category} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.category}</span>
                        <span className="font-medium">{formatLargeNumber(item.amount)}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">수입 내역이 없습니다.</p>
            )}
          </CardContent>
        </Card>

        {/* 지출 분석 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">지출 분석</CardTitle>
            <CardDescription>카테고리별 지출 현황</CardDescription>
          </CardHeader>
          <CardContent>
            {data.finance.expenseByCategory.length > 0 ? (
              <div className="space-y-3">
                {data.finance.expenseByCategory.map((item) => {
                  const percentage = Number(data.finance.expense) > 0
                    ? (Number(item.amount) / Number(data.finance.expense)) * 100
                    : 0;
                  return (
                    <div key={item.category} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.category}</span>
                        <span className="font-medium">{formatLargeNumber(item.amount)}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">지출 내역이 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 일별 추이 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">일별 수입/지출 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-end gap-1">
            {data.daily.map((day) => {
              const incomeHeight = maxDailyValue > 0 ? (Number(day.income) / maxDailyValue) * 100 : 0;
              const expenseHeight = maxDailyValue > 0 ? (Number(day.expense) / maxDailyValue) * 100 : 0;
              return (
                <div key={day.day} className="flex-1 flex flex-col items-center gap-1" title={`${day.day}일`}>
                  <div className="w-full flex gap-0.5 items-end h-[160px]">
                    <div
                      className="flex-1 bg-green-500 rounded-t"
                      style={{ height: `${incomeHeight}%`, minHeight: incomeHeight > 0 ? "2px" : 0 }}
                    />
                    <div
                      className="flex-1 bg-red-400 rounded-t"
                      style={{ height: `${expenseHeight}%`, minHeight: expenseHeight > 0 ? "2px" : 0 }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{day.day}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span>수입</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 bg-red-400 rounded" />
              <span>지출</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 영농 및 작물 현황 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Leaf className="h-4 w-4 text-green-500" />
              영농 활동 요약
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data.farming.activitySummary).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.farming.activitySummary).map(([type, count]) => (
                  <Badge key={type} variant="secondary">
                    {ACTIVITY_LABELS[type] || type}: {count}건
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">영농 활동 기록이 없습니다.</p>
            )}
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                영농일지 {data.farming.logCount}일 작성
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-orange-500" />
              작물 및 재고 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">작물 상태</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.crops.growing > 0 && <Badge variant="outline">재배중 {data.crops.growing}</Badge>}
                  {data.crops.harvesting > 0 && <Badge variant="outline">수확중 {data.crops.harvesting}</Badge>}
                  {data.crops.completed > 0 && <Badge variant="secondary">완료 {data.crops.completed}</Badge>}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">재고 변동</p>
                <div className="mt-1 text-sm">
                  <span className="text-green-600">+{data.inventory.inCount}</span>
                  {" / "}
                  <span className="text-red-600">-{data.inventory.outCount}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 작물별 수입 */}
      {data.finance.incomeByCrop.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">작물별 수입</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>작물</TableHead>
                  <TableHead className="text-right">수입</TableHead>
                  <TableHead className="text-right">비중</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.finance.incomeByCrop.map((item) => {
                  const percentage = Number(data.finance.income) > 0
                    ? ((Number(item.amount) / Number(data.finance.income)) * 100).toFixed(1)
                    : "0";
                  return (
                    <TableRow key={item.crop}>
                      <TableCell>{item.crop}</TableCell>
                      <TableCell className="text-right font-medium">{formatLargeNumber(item.amount)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{percentage}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
