"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2,
  Clock,
  AlertCircle,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface MarketSettings {
  autoCollectEnabled: boolean;
  collectTime: string;
  collectDaysAgo: number;
  collectDays: number[];
  corporationCodes: string[];
  targetProducts: string[];
  defaultViewDays: number;
  retentionDays: number;
  autoCleanupEnabled: boolean;
}

interface Corporation {
  code: string;
  name: string;
  selected: boolean;
}

const WEEKDAYS = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];

const AVAILABLE_PRODUCTS = [
  "토마토", "포도", "딸기", "수박", "참외", "오이", "고추",
  "배추", "상추", "시금치", "양배추", "무", "당근",
  "감자", "고구마", "사과", "배", "감귤", "복숭아", "멜론",
];

interface MarketCollectAutoSettingsProps {
  settings: MarketSettings;
  corporations: Corporation[];
  saving: boolean;
  hasUnsavedChanges: boolean;
  autoSettingsOpen: boolean;
  onAutoSettingsOpenChange: (open: boolean) => void;
  onSettingsChange: (settings: MarketSettings) => void;
  onSave: () => void;
  onReset: () => void;
}

export function MarketCollectAutoSettings({
  settings,
  corporations,
  saving,
  hasUnsavedChanges,
  autoSettingsOpen,
  onAutoSettingsOpenChange,
  onSettingsChange,
  onSave,
  onReset,
}: MarketCollectAutoSettingsProps) {
  function toggleCorporation(code: string) {
    const newCodes = settings.corporationCodes.includes(code)
      ? settings.corporationCodes.filter((c) => c !== code)
      : [...settings.corporationCodes, code];
    onSettingsChange({ ...settings, corporationCodes: newCodes });
  }

  function toggleProduct(product: string) {
    const newProducts = settings.targetProducts.includes(product)
      ? settings.targetProducts.filter((p) => p !== product)
      : [...settings.targetProducts, product];
    onSettingsChange({ ...settings, targetProducts: newProducts });
  }

  return (
    <Collapsible open={autoSettingsOpen} onOpenChange={onAutoSettingsOpenChange}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between mt-4 border-t pt-4">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            자동 수집 설정
            {settings.autoCollectEnabled && (
              <Badge variant="secondary" className="ml-2">
                활성화됨 ({settings.collectTime})
              </Badge>
            )}
          </span>
          {autoSettingsOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">자동 수집</Label>
            <p className="text-sm text-muted-foreground">
              지정된 시간에 자동으로 데이터를 수집합니다.
            </p>
          </div>
          <Switch
            checked={settings.autoCollectEnabled}
            onCheckedChange={(checked) =>
              onSettingsChange({ ...settings, autoCollectEnabled: checked })
            }
          />
        </div>

        {settings.autoCollectEnabled && (
          <div className="space-y-4 pl-4 border-l-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>수집 시간</Label>
                <Input
                  type="time"
                  value={settings.collectTime}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, collectTime: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>수집 대상</Label>
                <Select
                  value={settings.collectDaysAgo.toString()}
                  onValueChange={(v) =>
                    onSettingsChange({ ...settings, collectDaysAgo: parseInt(v, 10) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">오늘 데이터</SelectItem>
                    <SelectItem value="1">어제 데이터</SelectItem>
                    <SelectItem value="2">2일 전 데이터</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>수집 요일</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <Button
                    key={day.value}
                    variant={settings.collectDays.includes(day.value) ? "default" : "outline"}
                    size="sm"
                    className="w-10"
                    onClick={() => {
                      const newDays = settings.collectDays.includes(day.value)
                        ? settings.collectDays.filter((d) => d !== day.value)
                        : [...settings.collectDays, day.value].sort((a, b) => a - b);
                      onSettingsChange({ ...settings, collectDays: newDays });
                    }}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
              {settings.collectDays.length === 0 && (
                <p className="text-xs text-red-500">최소 1개 이상 선택해주세요.</p>
              )}
            </div>

            <div className="space-y-3">
              <Label>수집 대상 법인</Label>
              <div className="flex flex-wrap gap-2">
                {corporations.map((corp) => (
                  <Button
                    key={corp.code}
                    variant={settings.corporationCodes.includes(corp.code) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleCorporation(corp.code)}
                  >
                    {corp.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>수집 대상 품목</Label>
                <p className="text-sm text-muted-foreground">
                  선택하지 않으면 전체 품목을 수집합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_PRODUCTS.map((product) => (
                  <Button
                    key={product}
                    variant={settings.targetProducts.includes(product) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleProduct(product)}
                  >
                    {product}
                  </Button>
                ))}
              </div>
              {settings.targetProducts.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  선택됨: {settings.targetProducts.join(", ")}
                </p>
              )}
            </div>

            {settings.corporationCodes.length === 0 && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
                <AlertTriangle className="h-4 w-4" />
                수집 대상 법인을 최소 1개 이상 선택해주세요.
              </div>
            )}
          </div>
        )}

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="market-auto-cleanup">오래된 원본 자동 정리</Label>
            <Switch id="market-auto-cleanup" checked={settings.autoCleanupEnabled}
              onCheckedChange={(checked) => onSettingsChange({ ...settings, autoCleanupEnabled: checked })} />
          </div>
          <p className="text-sm text-muted-foreground">
            {settings.autoCleanupEnabled ? "보관 기간이 지난 원본을 자동 삭제합니다." : "정리 안 함 · 보관 기간을 넘긴 원본도 유지합니다."}
          </p>
          <Label htmlFor="market-retention-days">원본 보관 기간 (일)</Label>
          <Input id="market-retention-days" type="number" min={7} max={365}
            value={settings.retentionDays} disabled={!settings.autoCleanupEnabled}
            onChange={(event) => onSettingsChange({ ...settings, retentionDays: Number(event.target.value) })} />
          <p className="text-sm text-muted-foreground">7~365일. 기간을 늘려도 이미 삭제된 자료가 자동 복구되지는 않습니다.</p>
          {settings.autoCleanupEnabled && <p role="alert" className="text-sm text-amber-700">
            장기 집계 보관은 아직 제공되지 않습니다. 자동 정리를 켜면 오래된 가격 이력을 잃을 수 있습니다.
          </p>}
        </div>

        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                <AlertCircle className="h-3 w-3 mr-1" />
                저장되지 않은 변경사항
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {hasUnsavedChanges && (
              <Button variant="outline" onClick={onReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                취소
              </Button>
            )}
            <Button
              onClick={onSave}
              disabled={
                saving ||
                !Number.isInteger(settings.retentionDays) || settings.retentionDays < 7 || settings.retentionDays > 365 ||
                (settings.autoCollectEnabled && settings.corporationCodes.length === 0)
              }
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              설정 저장
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
