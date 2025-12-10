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
  Wallet,
  Building2,
  Leaf,
  Download,
  Award,
  Calendar,
} from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";

interface AnnualReportData {
  period: {
    year: number;
    startDate: string;
    endDate: string;
  };
  finance: {
    totalIncome: string;
    totalExpense: string;
    netProfit: string;
    profitMargin: number;
    incomeYoY: number;
    expenseYoY: number;
    transactionCount: number;
    avgMonthlyIncome: string;
    avgMonthlyExpense: string;
    bestMonth: { month: number; income: string };
    worstMonth: { month: number; income: string };
  };
  categories: {
    income: Array<{ category: string; amount: string; percentage: number }>;
    expense: Array<{ category: string; amount: string; percentage: number }>;
  };
  monthly: Array<{ month: number; income: string; expense: string; profit: string }>;
  quarterly: Array<{ quarter: number; income: string; expense: string; profit: string }>;
  crops: {
    total: number;
    completed: number;
    failed: number;
    successRate: number;
    profitability: Array<{ crop: string; income: string }>;
  };
  assets: {
    totalValue: string;
    totalMortgage: string;
    netValue: string;
    count: number;
  };
}

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export function AnnualReport() {
  const [data, setData] = useState<AnnualReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  async function fetchReport() {
    setLoading(true);
    try {
      const response = await fetch(`/api/reports/annual?year=${year}`);
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
  }, [year]);

  function exportReport() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annual_report_${year}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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

  const profit = Number(data.finance.netProfit);
  const maxMonthlyValue = Math.max(
    ...data.monthly.map((m) => Math.max(Number(m.income), Number(m.expense)))
  );

  return (
    <div className="space-y-6">
      {/* 연도 선택 */}
      <div className="flex items-center justify-between">
        <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportReport}>
          <Download className="mr-2 h-4 w-4" />
          내보내기
        </Button>
      </div>

      {/* 연간 요약 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              연간 총 수입
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatLargeNumber(data.finance.totalIncome)}
            </div>
            {data.finance.incomeYoY !== 0 && (
              <p className={`text-xs flex items-center gap-1 mt-1 ${data.finance.incomeYoY > 0 ? "text-green-600" : "text-red-600"}`}>
                {data.finance.incomeYoY > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                전년 대비 {Math.abs(data.finance.incomeYoY)}%
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              연간 총 지출
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatLargeNumber(data.finance.totalExpense)}
            </div>
            {data.finance.expenseYoY !== 0 && (
              <p className={`text-xs flex items-center gap-1 mt-1 ${data.finance.expenseYoY > 0 ? "text-red-600" : "text-green-600"}`}>
                {data.finance.expenseYoY > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                전년 대비 {Math.abs(data.finance.expenseYoY)}%
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              연간 순이익
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profit >= 0 ? "text-blue-600" : "text-red-600"}`}>
              {profit >= 0 ? "+" : ""}{formatLargeNumber(data.finance.netProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              수익률 {data.finance.profitMargin}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-500" />
              순자산
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatLargeNumber(data.assets.netValue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.assets.count}개 자산 보유
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 월별 추이 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">월별 수입/지출 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] flex items-end gap-2">
            {data.monthly.map((month) => {
              const incomeHeight = maxMonthlyValue > 0 ? (Number(month.income) / maxMonthlyValue) * 100 : 0;
              const expenseHeight = maxMonthlyValue > 0 ? (Number(month.expense) / maxMonthlyValue) * 100 : 0;
              return (
                <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-1 items-end h-[200px]">
                    <div
                      className="flex-1 bg-green-500 rounded-t"
                      style={{ height: `${incomeHeight}%`, minHeight: incomeHeight > 0 ? "4px" : 0 }}
                    />
                    <div
                      className="flex-1 bg-red-400 rounded-t"
                      style={{ height: `${expenseHeight}%`, minHeight: expenseHeight > 0 ? "4px" : 0 }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{MONTHS[month.month - 1]}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-6 mt-4">
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

      {/* 분기별 실적 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">분기별 실적</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>분기</TableHead>
                <TableHead className="text-right">수입</TableHead>
                <TableHead className="text-right">지출</TableHead>
                <TableHead className="text-right">순이익</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.quarterly.map((q) => (
                <TableRow key={q.quarter}>
                  <TableCell className="font-medium">{q.quarter}분기</TableCell>
                  <TableCell className="text-right text-green-600">{formatLargeNumber(q.income)}</TableCell>
                  <TableCell className="text-right text-red-600">{formatLargeNumber(q.expense)}</TableCell>
                  <TableCell className={`text-right font-medium ${Number(q.profit) >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {Number(q.profit) >= 0 ? "+" : ""}{formatLargeNumber(q.profit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 카테고리별 분석 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">수입 구성</CardTitle>
            <CardDescription>카테고리별 수입 비중</CardDescription>
          </CardHeader>
          <CardContent>
            {data.categories.income.length > 0 ? (
              <div className="space-y-3">
                {data.categories.income.slice(0, 5).map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{item.category}</span>
                      <span className="font-medium">{item.percentage}%</span>
                    </div>
                    <Progress value={item.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">수입 내역이 없습니다.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">지출 구성</CardTitle>
            <CardDescription>카테고리별 지출 비중</CardDescription>
          </CardHeader>
          <CardContent>
            {data.categories.expense.length > 0 ? (
              <div className="space-y-3">
                {data.categories.expense.slice(0, 5).map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{item.category}</span>
                      <span className="font-medium">{item.percentage}%</span>
                    </div>
                    <Progress value={item.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">지출 내역이 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 하이라이트 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4 text-yellow-500" />
              최고 매출월
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{MONTHS[data.finance.bestMonth.month - 1]}</div>
            <p className="text-sm text-green-600">{formatLargeNumber(data.finance.bestMonth.income)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              월평균 수입
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-600">{formatLargeNumber(data.finance.avgMonthlyIncome)}</div>
            <p className="text-sm text-muted-foreground">월평균 지출: {formatLargeNumber(data.finance.avgMonthlyExpense)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Leaf className="h-4 w-4 text-green-500" />
              작물 성공률
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{data.crops.successRate}%</div>
            <p className="text-sm text-muted-foreground">
              {data.crops.completed}/{data.crops.total} 완료
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 작물별 수익 */}
      {data.crops.profitability.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">작물별 수익 순위</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>순위</TableHead>
                  <TableHead>작물</TableHead>
                  <TableHead className="text-right">수입</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.crops.profitability.slice(0, 5).map((item, index) => (
                  <TableRow key={item.crop}>
                    <TableCell>
                      <Badge variant={index === 0 ? "default" : "secondary"}>{index + 1}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.crop}</TableCell>
                    <TableCell className="text-right text-green-600">{formatLargeNumber(item.income)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
