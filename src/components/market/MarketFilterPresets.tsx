"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Star, X } from "lucide-react";
import type { MarketPresets, PresetActionResult } from "./useMarketPresets";
import type { PresetPayload, SavedFilterPreset } from "./marketPriceTypes";

interface MarketFilterPresetsProps {
  productName: string | null;
  varieties: string[];
  origin: string | null;
  unit: string | null;
  grade: string | null;
  presets: MarketPresets;
  onApply: (preset: SavedFilterPreset) => void;
}

function describe(preset: SavedFilterPreset): string {
  return [
    preset.productName,
    preset.varieties.length ? preset.varieties.join(",") : null,
    preset.origin,
    preset.unit,
    preset.grade ? `${preset.grade} 등급` : null,
  ].filter(Boolean).join(" · ");
}

export function MarketFilterPresets({
  productName, varieties, origin, unit, grade, presets, onApply,
}: MarketFilterPresetsProps) {
  const [name, setName] = useState("");
  const hasFilter = Boolean(productName) && (varieties.length > 0 || origin !== null || unit !== null || grade !== null);

  function currentPayload(): PresetPayload | null {
    if (!productName) return null;
    const parts = [productName, ...(varieties.length ? [varieties.join(",")] : []), origin, unit, grade].filter(Boolean);
    return { name: name.trim() || parts.join(" "), productName, varieties, origin, unit, grade };
  }

  /** 실패는 성공으로 표시하지 않고, 계정이 바뀐 뒤 도착한 결과는 새 계정 화면에 알리지 않는다. */
  function reportResult(result: PresetActionResult, successMessage: string, fallbackError: string) {
    if (!result.ok) {
      toast.error(result.error || fallbackError);
      return;
    }
    if (!result.applied) return;
    toast.success(successMessage);
  }

  async function handleSaveToAccount(payload: PresetPayload | null) {
    if (!payload) return;
    const result = await presets.saveToAccount(payload);
    if (result.ok && result.applied) setName("");
    reportResult(result, "계정에 비교 조건을 저장했습니다.", "계정에 저장하지 못했습니다.");
  }

  async function handleDeleteAccount(preset: SavedFilterPreset) {
    reportResult(await presets.deleteAccountPreset(preset.id), "계정에서 삭제했습니다.", "삭제하지 못했습니다.");
  }

  function handleDeleteDevice(preset: SavedFilterPreset) {
    const result = presets.deleteDevicePreset(preset.id);
    // 저장에 실패하면 목록이 그대로 남는다. 성공으로 표시하지 않는다.
    if (!result.ok) toast.error(result.error || "이 기기에 저장된 목록을 수정하지 못했습니다.");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">비교 조건 저장</CardTitle>
        <p className="text-xs text-muted-foreground">
          품목·품종·산지·규격·등급 조합을 계정에 저장합니다. 저장한 조건은 다른 기기에서도 보입니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasFilter && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="조건 이름 (선택사항)"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-44 h-8 text-sm"
              aria-label="비교 조건 이름"
            />
            <Button size="sm" onClick={() => handleSaveToAccount(currentPayload())} disabled={presets.saving}>
              {presets.saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Star className="h-3 w-3 mr-1" />}
              계정에 저장
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">계정에 저장된 조건</Label>
          {presets.status === "loading" && <p role="status" className="text-sm text-muted-foreground">불러오는 중입니다.</p>}
          {presets.status === "unauthenticated" && (
            <p role="status" className="text-sm text-muted-foreground">로그인하면 계정에 조건을 저장할 수 있습니다.</p>
          )}
          {presets.status === "error" && (
            <div role="alert" className="text-sm text-destructive flex items-center gap-2">
              {presets.error || "저장된 비교 조건을 불러오지 못했습니다."}
              <Button variant="outline" size="sm" className="h-7" onClick={presets.reload}>다시 조회</Button>
            </div>
          )}
          {presets.status === "ready" && presets.accountPresets.length === 0 && (
            <p className="text-sm text-muted-foreground">저장된 조건이 없습니다.</p>
          )}
          <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
            {presets.accountPresets.map((preset) => (
              <li key={preset.id} className="inline-flex items-center overflow-hidden rounded-md border">
                <button
                  type="button"
                  className="px-2 py-1 text-xs hover:bg-accent"
                  title={describe(preset)}
                  onClick={() => onApply(preset)}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  className="px-1.5 py-1 border-l text-muted-foreground hover:text-destructive"
                  aria-label={`${preset.name} 계정에서 삭제`}
                  onClick={() => handleDeleteAccount(preset)}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {presets.devicePresets.length > 0 && (
          <div className="space-y-2 pt-3 border-t">
            <Label className="text-sm text-muted-foreground">이 기기에만 저장된 조건</Label>
            <p className="text-xs text-muted-foreground">
              이전에 이 브라우저에 저장된 조건입니다. 자동으로 계정에 올리지 않으니, 계정에서도 쓰려면 조건마다
              &lsquo;계정에 저장&rsquo;을 눌러 주세요.
            </p>
            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
              {presets.devicePresets.map((preset) => (
                <li key={preset.id} className="inline-flex items-center overflow-hidden rounded-md border bg-muted/40">
                  <button
                    type="button"
                    className="px-2 py-1 text-xs hover:bg-accent"
                    title={describe(preset)}
                    onClick={() => onApply(preset)}
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 border-l text-xs hover:bg-accent disabled:opacity-50"
                    disabled={presets.saving}
                    onClick={() => handleSaveToAccount({ ...preset })}
                  >
                    계정에 저장
                  </button>
                  <button
                    type="button"
                    className="px-1.5 py-1 border-l text-muted-foreground hover:text-destructive"
                    aria-label={`${preset.name} 이 기기에서 삭제`}
                    onClick={() => handleDeleteDevice(preset)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
