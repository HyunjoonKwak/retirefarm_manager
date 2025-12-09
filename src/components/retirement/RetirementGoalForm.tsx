"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";

const formSchema = z.object({
  targetDate: z.string().min(1, "목표 은퇴일을 선택해주세요."),
  targetAmount: z.number().min(1, "목표 자금을 입력해주세요."),
  monthlyLivingExpense: z.number().min(1, "월 생활비를 입력해주세요."),
  lifeExpectancy: z.number().min(60).max(120),
  inflationRate: z.number().min(0).max(20),
});

type FormValues = z.infer<typeof formSchema>;

interface RetirementGoalFormProps {
  initialData?: {
    targetDate: string;
    targetAmount: string;
    monthlyLivingExpense: string;
    lifeExpectancy: number;
    inflationRate: number;
  } | null;
}

export function RetirementGoalForm({ initialData }: RetirementGoalFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      targetDate: initialData?.targetDate
        ? new Date(initialData.targetDate).toISOString().split("T")[0]
        : "",
      targetAmount: initialData?.targetAmount ? Number(initialData.targetAmount) : 0,
      monthlyLivingExpense: initialData?.monthlyLivingExpense
        ? Number(initialData.monthlyLivingExpense)
        : 0,
      lifeExpectancy: initialData?.lifeExpectancy ?? 85,
      inflationRate: initialData?.inflationRate ?? 2.5,
    },
  });

  const watchTargetAmount = form.watch("targetAmount");
  const watchMonthlyExpense = form.watch("monthlyLivingExpense");

  async function onSubmit(data: FormValues) {
    setIsLoading(true);

    try {
      const response = await fetch("/api/retirement/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "저장 중 오류가 발생했습니다.");
      } else {
        toast.success("은퇴 목표가 저장되었습니다.");
        router.push("/retirement");
        router.refresh();
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>목표 설정</CardTitle>
            <CardDescription>
              은퇴 목표일과 목표 자금을 설정하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="targetDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>목표 은퇴일</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} disabled={isLoading} />
                  </FormControl>
                  <FormDescription>
                    은퇴를 목표로 하는 날짜를 선택하세요.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>목표 자금 (원)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="500000000"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormDescription>
                    은퇴 시점에 마련하고자 하는 총 자금입니다.
                    {watchTargetAmount > 0 && (
                      <span className="ml-2 font-medium text-primary">
                        ({formatLargeNumber(watchTargetAmount)})
                      </span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="monthlyLivingExpense"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>예상 월 생활비 (원)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="3000000"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormDescription>
                    은퇴 후 예상되는 월 생활비입니다.
                    {watchMonthlyExpense > 0 && (
                      <span className="ml-2 font-medium text-primary">
                        ({formatLargeNumber(watchMonthlyExpense)})
                      </span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>시뮬레이션 설정</CardTitle>
            <CardDescription>
              더 정확한 시뮬레이션을 위한 추가 설정입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="lifeExpectancy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>기대 수명 (세)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={60}
                      max={120}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormDescription>
                    필요 자금 계산에 사용됩니다. (한국인 평균 기대수명: 약 83세)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="inflationRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>예상 물가상승률 (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={20}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormDescription>
                    연간 물가상승률입니다. (한국 평균: 약 2~3%)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isLoading}
          >
            취소
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장하기
          </Button>
        </div>
      </form>
    </Form>
  );
}
