"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Progress } from "@/components/ui/progress";
import {
  Wallet,
  Loader2,
  Trash2,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Pencil,
  Building2,
  PiggyBank,
  CreditCard,
  Gift,
  HelpCircle,
  Briefcase,
  HandCoins,
} from "lucide-react";
import { formatLargeNumber, formatPercent, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import { FundingTimeline } from "./FundingTimeline";
import { FundingAddDialog } from "./FundingAddDialog";
import { FundingEditDialog } from "./FundingEditDialog";

interface FundingSource {
  id: string;
  type: "REAL_ESTATE_SALE" | "SAVINGS" | "LOAN" | "GOVERNMENT_SUBSIDY" | "RETIREMENT_PAY" | "SEVERANCE_PAY" | "OTHER";
  name: string;
  amount: string;
  expectedDate: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
  notes?: string;
  // asset_manager Portfolio id — 원장은 asset_manager 소유 (Asset Hub §1.5)
  externalAssetId?: string | null;
}

interface FundingSummary {
  totalAmount: string;
  completedAmount: string;
  totalSources: number;
  requiredAmount: string;
  fundingGap: string;
  fundingRatio: number;
}

interface MonthlyFlow {
  month: string;
  amount: string;
}

interface ExternalAsset {
  id: string;
  propertyType: string;
  propertyName: string;
  address: string;
  currentPrice: string;
  loanAmount?: string;
  hasLoan: boolean;
  estimatedNetProceeds?: string;
}

type FundingType = FundingSource["type"];

const FUNDING_TYPE_CONFIG = {
  REAL_ESTATE_SALE: { label: "부동산 매각", icon: Building2, color: "bg-blue-100 text-blue-800" },
  SAVINGS: { label: "저축", icon: PiggyBank, color: "bg-green-100 text-green-800" },
  LOAN: { label: "대출", icon: CreditCard, color: "bg-yellow-100 text-yellow-800" },
  GOVERNMENT_SUBSIDY: { label: "정부지원", icon: Gift, color: "bg-purple-100 text-purple-800" },
  RETIREMENT_PAY: { label: "퇴직금", icon: Briefcase, color: "bg-orange-100 text-orange-800" },
  SEVERANCE_PAY: { label: "위로금", icon: HandCoins, color: "bg-teal-100 text-teal-800" },
  OTHER: { label: "기타", icon: HelpCircle, color: "bg-gray-100 text-gray-800" },
};

const STATUS_CONFIG = {
  PLANNED: { label: "계획" },
  IN_PROGRESS: { label: "진행중" },
  COMPLETED: { label: "완료" },
};

export function FundingPlanManager() {
  const [fundingSources, setFundingSources] = useState<FundingSource[]>([]);
  const [summary, setSummary] = useState<FundingSummary | null>(null);
  const [monthlyFlow, setMonthlyFlow] = useState<MonthlyFlow[]>([]);
  const [loading, setLoading] = useState(true);

  const [externalAssets, setExternalAssets] = useState<ExternalAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newSource, setNewSource] = useState({
    type: "SAVINGS" as FundingType,
    name: "",
    amount: "",
    expectedDate: "",
    notes: "",
    selectedAssetId: "",
  });

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<FundingSource | null>(null);
  const [editSource, setEditSource] = useState({
    type: "SAVINGS" as FundingType,
    name: "",
    amount: "",
    expectedDate: "",
    notes: "",
  });

  async function fetchData() {
    try {
      const [sourcesRes, summaryRes] = await Promise.all([
        fetch("/api/funding"),
        fetch("/api/funding/summary"),
      ]);
      const sourcesData = await sourcesRes.json();
      const summaryData = await summaryRes.json();
      setFundingSources(sourcesData.fundingSources || []);
      setSummary(summaryData.summary || null);
      setMonthlyFlow(summaryData.monthlyFlow || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (newSource.type === "REAL_ESTATE_SALE" && isAddDialogOpen) {
      fetchExternalAssets();
    }
  }, [newSource.type, isAddDialogOpen]);

  // 연결 물건 이름 표시용 — 연결된 자금원이 있으면 물건 목록을 로드
  useEffect(() => {
    if (
      externalAssets.length === 0 &&
      fundingSources.some((s) => s.externalAssetId)
    ) {
      fetchExternalAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundingSources]);

  async function fetchExternalAssets() {
    setLoadingAssets(true);
    try {
      const response = await fetch("/api/assets/external?tradeType=OWNED");
      if (response.ok) {
        const result = await response.json();
        setExternalAssets(result.assets || []);
      }
    } catch (error) {
      console.error("Failed to fetch external assets:", error);
    } finally {
      setLoadingAssets(false);
    }
  }

  function handleAssetSelect(assetId: string) {
    const asset = externalAssets.find((a) => a.id === assetId);
    if (asset) {
      const realizableAmount = asset.estimatedNetProceeds
        ? Number(asset.estimatedNetProceeds)
        : Number(asset.currentPrice) - Number(asset.loanAmount || "0");
      setNewSource((prev) => ({
        ...prev,
        selectedAssetId: assetId,
        name: `${asset.propertyName} 매각`,
        amount: realizableAmount.toString(),
        notes: asset.address,
      }));
    } else {
      setNewSource((prev) => ({ ...prev, selectedAssetId: "" }));
    }
  }

  async function handleAddSource() {
    if (!newSource.name || !newSource.amount || !newSource.expectedDate) {
      toast.error("필수 항목을 입력해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/funding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newSource.type,
          name: newSource.name,
          amount: Number(newSource.amount),
          expectedDate: newSource.expectedDate,
          notes: newSource.notes || undefined,
          // asset_manager 물건에서 유래한 자금원은 원장 id를 연결해 둔다
          ...(newSource.selectedAssetId
            ? { externalAssetId: newSource.selectedAssetId }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "등록에 실패했습니다.");
      } else {
        toast.success("자금원이 등록되었습니다.");
        setIsAddDialogOpen(false);
        setNewSource({ type: "SAVINGS", name: "", amount: "", expectedDate: "", notes: "", selectedAssetId: "" });
        fetchData();
      }
    } catch {
      toast.error("등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEditStart(source: FundingSource) {
    setEditingSource(source);
    setEditSource({
      type: source.type,
      name: source.name,
      amount: source.amount,
      expectedDate: source.expectedDate.split("T")[0],
      notes: source.notes || "",
    });
    setIsEditDialogOpen(true);
  }

  async function handleEditSource() {
    if (!editingSource) return;
    if (!editSource.name || !editSource.amount || !editSource.expectedDate) {
      toast.error("필수 항목을 입력해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/funding/${editingSource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: editSource.type,
          name: editSource.name,
          amount: Number(editSource.amount),
          expectedDate: editSource.expectedDate,
          notes: editSource.notes,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "수정에 실패했습니다.");
      } else {
        toast.success("자금원이 수정되었습니다.");
        setIsEditDialogOpen(false);
        setEditingSource(null);
        fetchData();
      }
    } catch {
      toast.error("수정 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteSource(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const response = await fetch(`/api/funding/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "삭제에 실패했습니다.");
      } else {
        toast.success("자금원이 삭제되었습니다.");
        fetchData();
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    }
  }

  async function handleUpdateStatus(id: string, newStatus: string) {
    try {
      const response = await fetch(`/api/funding/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "상태 변경에 실패했습니다.");
      } else {
        toast.success("상태가 변경되었습니다.");
        fetchData();
      }
    } catch {
      toast.error("상태 변경 중 오류가 발생했습니다.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fundingGap = summary ? Number(summary.fundingGap) : 0;
  const isOverfunded = fundingGap < 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 조달 계획</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatLargeNumber(summary.totalAmount)}</div>
              <p className="text-xs text-muted-foreground">{summary.totalSources}개 자금원</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">조달 완료</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatLargeNumber(summary.completedAmount)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">필요 자금</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatLargeNumber(summary.requiredAmount)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {isOverfunded ? "초과 자금" : "자금 부족"}
              </CardTitle>
              <AlertCircle
                className={`h-4 w-4 ${isOverfunded ? "text-green-500" : "text-red-500"}`}
              />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${isOverfunded ? "text-green-600" : "text-red-600"}`}
              >
                {formatLargeNumber(Math.abs(fundingGap))}
              </div>
              <Progress value={Math.min(summary.fundingRatio, 100)} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                달성률 {formatPercent(summary.fundingRatio, 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Funding timeline */}
      {fundingSources.length > 0 && summary && (
        <FundingTimeline
          fundingSources={fundingSources}
          summary={summary}
          fundingGap={fundingGap}
          isOverfunded={isOverfunded}
        />
      )}

      {/* Add dialog */}
      <div className="flex justify-end">
        <FundingAddDialog
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          newSource={newSource}
          externalAssets={externalAssets}
          loadingAssets={loadingAssets}
          isSubmitting={isSubmitting}
          onTypeChange={(type) =>
            setNewSource((p) => ({ ...p, type, selectedAssetId: "", name: "", amount: "", notes: "" }))
          }
          onFieldChange={(field, value) => setNewSource((p) => ({ ...p, [field]: value }))}
          onAssetSelect={handleAssetSelect}
          onSubmit={handleAddSource}
        />
      </div>

      {/* Funding sources table */}
      <Card>
        <CardHeader>
          <CardTitle>자금 조달 목록</CardTitle>
          <CardDescription>등록된 자금 조달 계획입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {fundingSources.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>유형</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>예상일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fundingSources.map((source) => {
                  const typeConfig = FUNDING_TYPE_CONFIG[source.type];
                  const TypeIcon = typeConfig.icon;
                  return (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${typeConfig.color}`}
                        >
                          <TypeIcon className="h-3 w-3" />
                          {typeConfig.label}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{source.name}</p>
                          {source.externalAssetId && (
                            <p className="text-xs text-muted-foreground">
                              연결:{" "}
                              {externalAssets.find(
                                (a) => a.id === source.externalAssetId
                              )?.propertyName ?? "asset_manager 물건"}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatLargeNumber(source.amount)}
                      </TableCell>
                      <TableCell>{formatDate(source.expectedDate)}</TableCell>
                      <TableCell>
                        <Select
                          value={source.status}
                          onValueChange={(v) => handleUpdateStatus(source.id, v)}
                        >
                          <SelectTrigger className="w-[100px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                              <SelectItem key={key} value={key}>
                                {config.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => handleEditStart(source)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700"
                            onClick={() => handleDeleteSource(source.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">등록된 자금원이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <FundingEditDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        editSource={editSource}
        isSubmitting={isSubmitting}
        onFieldChange={(field, value) => setEditSource((p) => ({ ...p, [field]: value }))}
        onSubmit={handleEditSource}
      />

      {/* Monthly cashflow */}
      {monthlyFlow.length > 0 && monthlyFlow.some((m) => Number(m.amount) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>월별 예상 현금흐름</CardTitle>
            <CardDescription>향후 12개월간 예상 자금 유입입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 grid-cols-6 md:grid-cols-12">
              {monthlyFlow.map((flow) => (
                <div key={flow.month} className="text-center">
                  <p className="text-xs text-muted-foreground">{flow.month.slice(5)}월</p>
                  <p
                    className={`text-sm font-medium ${
                      Number(flow.amount) > 0 ? "text-green-600" : "text-muted-foreground"
                    }`}
                  >
                    {Number(flow.amount) > 0 ? formatLargeNumber(flow.amount) : "-"}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
