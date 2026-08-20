"use client";

/**
 * 온보딩 마법사 (Asset Hub §6 — ssampin 온보딩 패턴 차용)
 *
 * 1) 농장 프로필 → 2) 재배 예정 작물 선택 → 3) 확인·완료.
 * 완료 시 선택 작물 중 가락시장 수집 품목은 시세 워치리스트에 자동 등록된다.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sprout, MapPin, ClipboardCheck, Plus, X } from "lucide-react";
import { MARKET_PRODUCTS } from "@/lib/constants/market-products";
import {
  FARMING_TYPES,
  FARMING_TYPE_LABELS,
  type FarmingType,
} from "@/lib/constants/farming";
import { toast } from "sonner";

const STEPS = [
  { title: "농장 프로필", icon: MapPin },
  { title: "재배 예정 작물", icon: Sprout },
  { title: "확인 및 완료", icon: ClipboardCheck },
] as const;

const YEAR_OPTIONS = Array.from(
  { length: 11 },
  (_, i) => new Date().getFullYear() + i
);

interface WizardState {
  region: string;
  farmingType: FarmingType;
  areaPyeong: string;
  targetStartYear: string;
  plannedCrops: string[];
  addToWatchlist: boolean;
}

const INITIAL_STATE: WizardState = {
  region: "",
  farmingType: "OPEN_FIELD",
  areaPyeong: "",
  targetStartYear: "",
  plannedCrops: [],
  addToWatchlist: true,
};

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [customCrop, setCustomCrop] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 재실행 시 기존 프로필 프리필
  useEffect(() => {
    async function fetchExisting() {
      try {
        const response = await fetch("/api/onboarding");
        if (!response.ok) return;
        const result = await response.json();
        const profile = result.data?.profile;
        if (profile) {
          setState((prev) => ({
            ...prev,
            region: profile.region ?? "",
            farmingType: profile.farmingType ?? "OPEN_FIELD",
            areaPyeong: profile.areaPyeong ? String(profile.areaPyeong) : "",
            targetStartYear: profile.targetStartYear
              ? String(profile.targetStartYear)
              : "",
            plannedCrops: profile.plannedCrops ?? [],
          }));
        }
      } finally {
        setLoading(false);
      }
    }
    fetchExisting();
  }, []);

  function toggleCrop(name: string) {
    setState((prev) => ({
      ...prev,
      plannedCrops: prev.plannedCrops.includes(name)
        ? prev.plannedCrops.filter((c) => c !== name)
        : [...prev.plannedCrops, name],
    }));
  }

  function addCustomCrop() {
    const name = customCrop.trim();
    if (!name) return;
    if (state.plannedCrops.includes(name)) {
      toast.error("이미 선택된 작물입니다.");
      return;
    }
    setState((prev) => ({ ...prev, plannedCrops: [...prev.plannedCrops, name] }));
    setCustomCrop("");
  }

  function canProceed(): boolean {
    if (step === 0) return state.region.trim().length > 0;
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: state.region.trim(),
          farmingType: state.farmingType,
          ...(state.areaPyeong ? { areaPyeong: Number(state.areaPyeong) } : {}),
          ...(state.targetStartYear
            ? { targetStartYear: Number(state.targetStartYear) }
            : {}),
          plannedCrops: state.plannedCrops,
          addToWatchlist: state.addToWatchlist,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "저장 실패");
      }

      const { watchlistAdded, watchlistSkipped } = result.data;
      toast.success(
        watchlistAdded > 0
          ? `설정 완료 — 시세 워치리스트에 ${watchlistAdded}개 품목을 등록했습니다.`
          : "설정이 완료되었습니다."
      );
      if (watchlistSkipped?.length > 0) {
        toast.info(
          `${watchlistSkipped.join(", ")}은(는) 가락시장 수집 품목이 아니라 워치리스트에서 제외했습니다.`
        );
      }
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "저장 중 오류가 발생했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const StepIcon = STEPS[step].icon;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* 진행 표시 */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <span key={s.title} className={i === step ? "font-medium text-foreground" : ""}>
              {i + 1}. {s.title}
            </span>
          ))}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StepIcon className="h-5 w-5" />
            {STEPS[step].title}
          </CardTitle>
          {step === 0 && (
            <CardDescription>귀농할 농장의 기본 정보를 입력하세요.</CardDescription>
          )}
          {step === 1 && (
            <CardDescription>
              재배 예정 작물을 선택하세요. 가락시장 수집 품목은 시세 워치리스트에
              자동 등록됩니다. 실제 파종 후 작물 관리에서 작기를 등록하면 작기
              캘린더에 표시됩니다.
            </CardDescription>
          )}
          {step === 2 && (
            <CardDescription>입력 내용을 확인하고 완료하세요.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="region">지역 *</Label>
                <Input
                  id="region"
                  placeholder="예: 충북 괴산군"
                  value={state.region}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, region: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>재배 형태</Label>
                <Select
                  value={state.farmingType}
                  onValueChange={(v) =>
                    setState((prev) => ({ ...prev, farmingType: v as FarmingType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FARMING_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {FARMING_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="area">재배(예정) 면적 (평)</Label>
                  <Input
                    id="area"
                    inputMode="numeric"
                    placeholder="예: 1500"
                    value={state.areaPyeong}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        areaPyeong: e.target.value.replace(/[^0-9.]/g, ""),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>귀농 목표 연도</Label>
                  <Select
                    value={state.targetStartYear}
                    onValueChange={(v) =>
                      setState((prev) => ({ ...prev, targetStartYear: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="선택 (선택사항)" />
                    </SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}년
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="flex flex-wrap gap-2">
                {MARKET_PRODUCTS.map((name) => {
                  const selected = state.plannedCrops.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleCrop(name)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="목록에 없는 작물 직접 입력"
                  value={customCrop}
                  onChange={(e) => setCustomCrop(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomCrop();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addCustomCrop}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {state.plannedCrops.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {state.plannedCrops.map((name) => (
                    <Badge key={name} variant="secondary" className="gap-1">
                      {name}
                      <button
                        type="button"
                        onClick={() => toggleCrop(name)}
                        aria-label={`${name} 제거`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">지역</dt>
                  <dd className="font-medium">{state.region}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">재배 형태</dt>
                  <dd className="font-medium">
                    {FARMING_TYPE_LABELS[state.farmingType]}
                  </dd>
                </div>
                {state.areaPyeong && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">면적</dt>
                    <dd className="font-medium">{state.areaPyeong}평</dd>
                  </div>
                )}
                {state.targetStartYear && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">목표 연도</dt>
                    <dd className="font-medium">{state.targetStartYear}년</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">재배 예정 작물</dt>
                  <dd className="text-right font-medium">
                    {state.plannedCrops.length > 0
                      ? state.plannedCrops.join(", ")
                      : "미선택"}
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">시세 워치리스트 자동 등록</p>
                  <p className="text-xs text-muted-foreground">
                    선택 작물 중 가락시장 수집 품목의 경락 시세를 추적합니다.
                  </p>
                </div>
                <Switch
                  checked={state.addToWatchlist}
                  onCheckedChange={(v) =>
                    setState((prev) => ({ ...prev, addToWatchlist: v }))
                  }
                />
              </div>
            </>
          )}

          {/* 네비게이션 */}
          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || submitting}
            >
              이전
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
                다음
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                완료
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
