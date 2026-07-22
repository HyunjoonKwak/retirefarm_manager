"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, X } from "lucide-react";
import { SavedFilterPreset } from "./marketPriceTypes";

interface MarketPriceFilterProps {
  varieties: string[];
  origins: string[];
  unitOptions: string[];
  selectedVarieties: string[];
  selectedOrigin: string | null;
  selectedUnit: string | null;
  filterPresets: SavedFilterPreset[];
  presetNameInput: string;
  onVarietiesChange: (varieties: string[]) => void;
  onOriginChange: (origin: string | null) => void;
  onUnitChange: (unit: string | null) => void;
  onPresetNameChange: (name: string) => void;
  onSavePreset: () => void;
  onLoadPreset: (preset: SavedFilterPreset) => void;
  onDeletePreset: (id: string) => void;
}

export function MarketPriceFilter({
  varieties,
  origins,
  unitOptions,
  selectedVarieties,
  selectedOrigin,
  selectedUnit,
  filterPresets,
  presetNameInput,
  onVarietiesChange,
  onOriginChange,
  onUnitChange,
  onPresetNameChange,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
}: MarketPriceFilterProps) {
  function toggleVariety(v: string) {
    if (selectedVarieties.includes(v)) {
      onVarietiesChange(selectedVarieties.filter((sv) => sv !== v));
    } else {
      onVarietiesChange([...selectedVarieties, v]);
    }
  }

  const hasFilter = selectedVarieties.length > 0 || selectedOrigin || selectedUnit;

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        {varieties.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm">품종 (다중선택)</Label>
            <div className="flex flex-wrap gap-2">
              {varieties.map((v) => (
                <Button
                  key={v}
                  variant={selectedVarieties.includes(v) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleVariety(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">산지</Label>
            <Select
              value={selectedOrigin || "_all"}
              onValueChange={(v) => onOriginChange(v === "_all" ? null : v)}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">전체</SelectItem>
                {origins.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {unitOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">단위</Label>
              <Select
                value={selectedUnit || "_all"}
                onValueChange={(v) => onUnitChange(v === "_all" ? null : v)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">전체</SelectItem>
                  {unitOptions.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onVarietiesChange([]);
                onOriginChange(null);
                onUnitChange(null);
              }}
            >
              필터 초기화
            </Button>
          )}
        </div>

        {selectedVarieties.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2 border-t">
            <span className="text-xs text-muted-foreground mr-2">선택됨:</span>
            {selectedVarieties.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                onClick={() =>
                  onVarietiesChange(selectedVarieties.filter((sv) => sv !== v))
                }
              >
                {v}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}

        {hasFilter && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
            <Input
              placeholder="조합 이름 (선택사항)"
              value={presetNameInput}
              onChange={(e) => onPresetNameChange(e.target.value)}
              className="w-40 h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSavePreset();
              }}
            />
            <Button variant="outline" size="sm" onClick={onSavePreset}>
              <Star className="h-3 w-3 mr-1" />
              조합 저장
            </Button>
          </div>
        )}

        {filterPresets.length > 0 && (
          <div className="space-y-2 pt-3 border-t">
            <Label className="text-sm text-muted-foreground">저장된 조합</Label>
            <div className="flex flex-wrap gap-2">
              {filterPresets.map((preset) => (
                <Badge
                  key={preset.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground group"
                  onClick={() => onLoadPreset(preset)}
                >
                  {preset.name}
                  <button
                    className="ml-1 opacity-50 group-hover:opacity-100 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePreset(preset.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
