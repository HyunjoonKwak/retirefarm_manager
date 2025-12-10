"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Calendar, PiggyBank, Home, AlertCircle } from "lucide-react";
import { smartFarmPlanSchema, SmartFarmPlanFormInput } from "@/lib/validations/plan";

interface RetirementGoalFormProps {
  initialData?: {
    targetDate: string;
    estimatedRetirementPay: string | null;
    estimatedSeverancePay: string | null;
    monthlyLivingExpense: string | null;
    bufferMonths: number | null;
  } | null;
  onSave: () => void;
  onCancel?: () => void;
}

export function RetirementGoalForm({ initialData, onSave, onCancel }: RetirementGoalFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SmartFarmPlanFormInput>({
    resolver: zodResolver(smartFarmPlanSchema),
    defaultValues: {
      targetDate: initialData?.targetDate
        ? new Date(initialData.targetDate).toISOString().split("T")[0]
        : "",
      estimatedRetirementPay: initialData?.estimatedRetirementPay
        ? Number(initialData.estimatedRetirementPay)
        : undefined,
      estimatedSeverancePay: initialData?.estimatedSeverancePay
        ? Number(initialData.estimatedSeverancePay)
        : undefined,
      monthlyLivingExpense: initialData?.monthlyLivingExpense
        ? Number(initialData.monthlyLivingExpense)
        : undefined,
      bufferMonths: initialData?.bufferMonths || 6,
    },
  });

  const monthlyLivingExpense = watch("monthlyLivingExpense");
  const bufferMonths = watch("bufferMonths");
  const calculatedBuffer =
    (monthlyLivingExpense || 0) * (bufferMonths || 6);

  const onSubmit = async (data: SmartFarmPlanFormInput) => {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "저장에 실패했습니다.");
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {initialData ? "퇴직 목표 수정" : "퇴직 목표 설정"}
        </CardTitle>
        <CardDescription>
          퇴직 목표일과 예상 퇴직금을 입력하여 스마트팜 준비 계획을 시작하세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* 퇴직 목표일 */}
          <div className="space-y-2">
            <Label htmlFor="targetDate" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              퇴직 목표일 *
            </Label>
            <Input
              id="targetDate"
              type="date"
              {...register("targetDate")}
              className={errors.targetDate ? "border-red-500" : ""}
            />
            {errors.targetDate && (
              <p className="text-sm text-red-500">{errors.targetDate.message}</p>
            )}
          </div>

          {/* 퇴직금 섹션 */}
          <div className="space-y-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4" />
              <span className="font-medium">예상 퇴직금</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="estimatedRetirementPay">DC 퇴직금 (원)</Label>
                <Input
                  id="estimatedRetirementPay"
                  type="number"
                  placeholder="예: 250000000"
                  {...register("estimatedRetirementPay", { valueAsNumber: true })}
                />
                <p className="text-xs text-muted-foreground">
                  DC 계좌에서 예상되는 퇴직금 총액
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="estimatedSeverancePay">퇴직수당 (원)</Label>
                <Input
                  id="estimatedSeverancePay"
                  type="number"
                  placeholder="예: 10000000"
                  {...register("estimatedSeverancePay", { valueAsNumber: true })}
                />
                <p className="text-xs text-muted-foreground">
                  회사에서 별도로 지급하는 퇴직수당
                </p>
              </div>
            </div>
          </div>

          {/* 초기 생활비 버퍼 */}
          <div className="space-y-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              <span className="font-medium">초기 생활비 버퍼</span>
            </div>
            <p className="text-sm text-muted-foreground">
              스마트팜 수입이 안정화되기 전까지 필요한 생활비를 미리 확보하세요.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="monthlyLivingExpense">월 생활비 (원)</Label>
                <Input
                  id="monthlyLivingExpense"
                  type="number"
                  placeholder="예: 3000000"
                  {...register("monthlyLivingExpense", { valueAsNumber: true })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bufferMonths">버퍼 개월 수</Label>
                <Input
                  id="bufferMonths"
                  type="number"
                  min={1}
                  max={24}
                  {...register("bufferMonths", { valueAsNumber: true })}
                />
              </div>
            </div>

            {calculatedBuffer > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  예상 초기 버퍼:{" "}
                  <span className="font-bold">
                    {calculatedBuffer.toLocaleString()}원
                  </span>
                  <span className="text-blue-600 ml-1">
                    ({bufferMonths}개월분)
                  </span>
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                취소
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? "저장" : "시작하기"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
