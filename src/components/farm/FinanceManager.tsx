"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  Plus,
  Loader2,
  Trash2,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { formatLargeNumber, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";

interface Transaction {
  id: string;
  date: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  subcategory: string | null;
  amount: string;
  description: string;
  paymentMethod: string | null;
  crop?: { id: string; name: string } | null;
}

interface Summary {
  totalIncome: string;
  totalExpense: string;
  netProfit: string;
  transactionCount: number;
  incomeChange: number;
  expenseChange: number;
}

const INCOME_CATEGORIES = [
  { value: "판매", label: "농산물 판매" },
  { value: "보조금", label: "정부 보조금" },
  { value: "임대", label: "농지/시설 임대" },
  { value: "기타수입", label: "기타 수입" },
];

const EXPENSE_CATEGORIES = [
  { value: "종자", label: "종자/묘목" },
  { value: "비료", label: "비료" },
  { value: "농약", label: "농약" },
  { value: "인건비", label: "인건비" },
  { value: "기계", label: "기계/장비" },
  { value: "연료", label: "연료비" },
  { value: "전기", label: "전기/수도" },
  { value: "포장", label: "포장/물류" },
  { value: "수리", label: "수리/유지" },
  { value: "기타비용", label: "기타 비용" },
];

export function FinanceManager() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // 거래 추가 다이얼로그
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTx, setNewTx] = useState({
    date: new Date().toISOString().split("T")[0],
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    category: "",
    amount: "",
    description: "",
  });

  async function fetchData() {
    try {
      let url = "/api/farm/finance";
      if (typeFilter !== "all") {
        url += `?type=${typeFilter}`;
      }

      const [txRes, summaryRes] = await Promise.all([
        fetch(url),
        fetch("/api/farm/finance/summary"),
      ]);

      const txData = await txRes.json();
      const summaryData = await summaryRes.json();

      setTransactions(txData.transactions || []);
      setSummary(summaryData.summary || null);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [typeFilter]);

  async function handleAddTransaction() {
    if (!newTx.date || !newTx.category || !newTx.amount || !newTx.description) {
      toast.error("필수 항목을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/farm/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newTx,
          amount: Number(newTx.amount),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "등록에 실패했습니다.");
      } else {
        toast.success("거래가 등록되었습니다.");
        setIsAddDialogOpen(false);
        setNewTx({
          date: new Date().toISOString().split("T")[0],
          type: "EXPENSE",
          category: "",
          amount: "",
          description: "",
        });
        fetchData();
      }
    } catch {
      toast.error("등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteTransaction(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/farm/finance/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "삭제에 실패했습니다.");
      } else {
        toast.success("거래가 삭제되었습니다.");
        fetchData();
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    }
  }

  const categories = newTx.type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      {summary && (
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
                {formatLargeNumber(summary.totalIncome)}
              </div>
              {summary.incomeChange !== 0 && (
                <p className={`text-xs flex items-center gap-1 ${summary.incomeChange > 0 ? "text-green-600" : "text-red-600"}`}>
                  {summary.incomeChange > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  전월 대비 {Math.abs(summary.incomeChange)}%
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
                {formatLargeNumber(summary.totalExpense)}
              </div>
              {summary.expenseChange !== 0 && (
                <p className={`text-xs flex items-center gap-1 ${summary.expenseChange > 0 ? "text-red-600" : "text-green-600"}`}>
                  {summary.expenseChange > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  전월 대비 {Math.abs(summary.expenseChange)}%
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
              <div className={`text-2xl font-bold ${Number(summary.netProfit) >= 0 ? "text-blue-600" : "text-red-600"}`}>
                {formatLargeNumber(summary.netProfit)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">거래 건수</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.transactionCount}건</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 필터 및 추가 버튼 */}
      <div className="flex items-center justify-between">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="INCOME">수입만</SelectItem>
            <SelectItem value="EXPENSE">지출만</SelectItem>
          </SelectContent>
        </Select>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              거래 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>거래 등록</DialogTitle>
              <DialogDescription>수입 또는 지출 내역을 등록합니다.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>거래 유형</Label>
                  <Select
                    value={newTx.type}
                    onValueChange={(v) => setNewTx((p) => ({ ...p, type: v as "INCOME" | "EXPENSE", category: "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INCOME">수입</SelectItem>
                      <SelectItem value="EXPENSE">지출</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>날짜 *</Label>
                  <Input
                    type="date"
                    value={newTx.date}
                    onChange={(e) => setNewTx((p) => ({ ...p, date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>분류 *</Label>
                  <Select
                    value={newTx.category}
                    onValueChange={(v) => setNewTx((p) => ({ ...p, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>금액 (원) *</Label>
                  <Input
                    type="number"
                    placeholder="50000"
                    value={newTx.amount}
                    onChange={(e) => setNewTx((p) => ({ ...p, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>내용 *</Label>
                <Input
                  placeholder="예: 딸기 판매 - A마트"
                  value={newTx.description}
                  onChange={(e) => setNewTx((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddTransaction} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                등록
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 거래 목록 */}
      {transactions.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>분류</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{formatDate(tx.date)}</TableCell>
                    <TableCell>
                      <Badge variant={tx.type === "INCOME" ? "default" : "secondary"}>
                        {tx.type === "INCOME" ? "수입" : "지출"}
                      </Badge>
                    </TableCell>
                    <TableCell>{tx.category}</TableCell>
                    <TableCell>
                      <div>
                        <p>{tx.description}</p>
                        {tx.crop && (
                          <p className="text-xs text-muted-foreground">
                            작물: {tx.crop.name}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${tx.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                      {tx.type === "INCOME" ? "+" : "-"}{formatLargeNumber(tx.amount)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500"
                        onClick={() => handleDeleteTransaction(tx.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">등록된 거래 내역이 없습니다.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
