"use client";

import { Button } from "@/components/ui/button";
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
import { Loader2, Plus } from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";
import { Building2, PiggyBank, CreditCard, Gift, HelpCircle, Briefcase, HandCoins } from "lucide-react";

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

type FundingType =
  | "REAL_ESTATE_SALE"
  | "SAVINGS"
  | "LOAN"
  | "GOVERNMENT_SUBSIDY"
  | "RETIREMENT_PAY"
  | "SEVERANCE_PAY"
  | "OTHER";

interface NewSource {
  type: FundingType;
  name: string;
  amount: string;
  expectedDate: string;
  notes: string;
  selectedAssetId: string;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APARTMENT: "아파트",
  OFFICETEL: "오피스텔",
  VILLA: "빌라",
  BUILDING: "건물",
  COMMERCIAL: "상가",
  LAND: "토지",
  FACTORY: "공장",
  STUDIO: "원룸",
  OTHER: "기타",
};

const FUNDING_TYPE_CONFIG = {
  REAL_ESTATE_SALE: { label: "부동산 매각", icon: Building2, color: "bg-blue-100 text-blue-800" },
  SAVINGS: { label: "저축", icon: PiggyBank, color: "bg-green-100 text-green-800" },
  LOAN: { label: "대출", icon: CreditCard, color: "bg-yellow-100 text-yellow-800" },
  GOVERNMENT_SUBSIDY: { label: "정부지원", icon: Gift, color: "bg-purple-100 text-purple-800" },
  RETIREMENT_PAY: { label: "퇴직금", icon: Briefcase, color: "bg-orange-100 text-orange-800" },
  SEVERANCE_PAY: { label: "위로금", icon: HandCoins, color: "bg-teal-100 text-teal-800" },
  OTHER: { label: "기타", icon: HelpCircle, color: "bg-gray-100 text-gray-800" },
};

function formatKoreanCurrency(value: string): string {
  const num = Number(value);
  if (isNaN(num) || num === 0) return "";
  const eok = Math.floor(num / 100000000);
  const man = Math.floor((num % 100000000) / 10000);
  const won = num % 10000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString()}억`);
  if (man > 0) parts.push(`${man.toLocaleString()}만`);
  if (won > 0 && num < 100000000) parts.push(`${won.toLocaleString()}`);
  return parts.length > 0 ? `${parts.join(" ")}원` : "";
}

function formatNumberWithCommas(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return num.toLocaleString();
}

interface FundingAddDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  newSource: NewSource;
  externalAssets: ExternalAsset[];
  loadingAssets: boolean;
  isSubmitting: boolean;
  onTypeChange: (type: FundingType) => void;
  onFieldChange: (field: keyof Omit<NewSource, "type" | "selectedAssetId">, value: string) => void;
  onAssetSelect: (assetId: string) => void;
  onSubmit: () => void;
}

export function FundingAddDialog({
  isOpen,
  onOpenChange,
  newSource,
  externalAssets,
  loadingAssets,
  isSubmitting,
  onTypeChange,
  onFieldChange,
  onAssetSelect,
  onSubmit,
}: FundingAddDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          자금원 추가
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>자금원 추가</DialogTitle>
          <DialogDescription>자금 조달 계획을 등록합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>유형</Label>
            <Select
              value={newSource.type}
              onValueChange={(v) => onTypeChange(v as FundingType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FUNDING_TYPE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {newSource.type === "REAL_ESTATE_SALE" && (
            <div className="space-y-2">
              <Label>보유 부동산 선택</Label>
              {loadingAssets ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  불러오는 중...
                </div>
              ) : externalAssets.length > 0 ? (
                <Select value={newSource.selectedAssetId} onValueChange={onAssetSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="부동산을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">직접 입력</SelectItem>
                    {externalAssets.map((asset) => {
                      const realizableAmount = asset.estimatedNetProceeds
                        ? Number(asset.estimatedNetProceeds)
                        : Number(asset.currentPrice) - Number(asset.loanAmount || "0");
                      return (
                        <SelectItem key={asset.id} value={asset.id}>
                          <div className="flex flex-col">
                            <span>{asset.propertyName}</span>
                            <span className="text-xs text-muted-foreground">
                              {PROPERTY_TYPE_LABELS[asset.propertyType] || asset.propertyType} ·
                              실현가능수익금 {formatLargeNumber(realizableAmount.toString())}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  보유 중인 부동산이 없습니다.{" "}
                  <a
                    href="https://assets.specialrisk.me/portfolio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    자산 등록하기
                  </a>
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>이름</Label>
            <Input
              placeholder="예: 강남 아파트 매각"
              value={newSource.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>금액 (원)</Label>
            <Input
              type="number"
              placeholder="500000000"
              value={newSource.amount}
              onChange={(e) => onFieldChange("amount", e.target.value)}
            />
            {newSource.amount && (
              <p className="text-xs text-blue-600 font-medium">
                {formatNumberWithCommas(newSource.amount)}원 ={" "}
                {formatKoreanCurrency(newSource.amount) || "0원"}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>예상 조달일</Label>
            <Input
              type="date"
              value={newSource.expectedDate}
              onChange={(e) => onFieldChange("expectedDate", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>메모</Label>
            <Input
              placeholder="추가 정보"
              value={newSource.notes}
              onChange={(e) => onFieldChange("notes", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
