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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Building2, PiggyBank, CreditCard, Gift, HelpCircle, Briefcase, HandCoins } from "lucide-react";

type FundingType =
  | "REAL_ESTATE_SALE"
  | "SAVINGS"
  | "LOAN"
  | "GOVERNMENT_SUBSIDY"
  | "RETIREMENT_PAY"
  | "SEVERANCE_PAY"
  | "OTHER";

interface EditSource {
  type: FundingType;
  name: string;
  amount: string;
  expectedDate: string;
  notes: string;
}

const FUNDING_TYPE_CONFIG = {
  REAL_ESTATE_SALE: { label: "부동산 매각", icon: Building2 },
  SAVINGS: { label: "저축", icon: PiggyBank },
  LOAN: { label: "대출", icon: CreditCard },
  GOVERNMENT_SUBSIDY: { label: "정부지원", icon: Gift },
  RETIREMENT_PAY: { label: "퇴직금", icon: Briefcase },
  SEVERANCE_PAY: { label: "위로금", icon: HandCoins },
  OTHER: { label: "기타", icon: HelpCircle },
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

interface FundingEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editSource: EditSource;
  isSubmitting: boolean;
  onFieldChange: (field: keyof EditSource, value: string) => void;
  onSubmit: () => void;
}

export function FundingEditDialog({
  isOpen,
  onOpenChange,
  editSource,
  isSubmitting,
  onFieldChange,
  onSubmit,
}: FundingEditDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>자금원 수정</DialogTitle>
          <DialogDescription>자금 조달 계획을 수정합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>유형</Label>
            <Select
              value={editSource.type}
              onValueChange={(v) => onFieldChange("type", v)}
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
          <div className="space-y-2">
            <Label>이름</Label>
            <Input
              placeholder="예: 강남 아파트 매각"
              value={editSource.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>금액 (원)</Label>
            <Input
              type="number"
              placeholder="500000000"
              value={editSource.amount}
              onChange={(e) => onFieldChange("amount", e.target.value)}
            />
            {editSource.amount && (
              <p className="text-xs text-blue-600 font-medium">
                {formatNumberWithCommas(editSource.amount)}원 ={" "}
                {formatKoreanCurrency(editSource.amount) || "0원"}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>예상 조달일</Label>
            <Input
              type="date"
              value={editSource.expectedDate}
              onChange={(e) => onFieldChange("expectedDate", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>메모</Label>
            <Input
              placeholder="추가 정보"
              value={editSource.notes}
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
            수정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
