"use client";

/**
 * 작기(作期) 캘린더 (Asset Hub §6 — ssampin 학기+컬러 라벨 일정 패턴 차용)
 *
 * 작물 하나 = 작기 하나(파종~수확예정)를 월간 그리드에 컬러 막대로 표시한다.
 * 데이터는 기존 /api/farm/crops를 그대로 사용한다.
 */

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sprout,
  Wheat,
  CalendarDays,
} from "lucide-react";
import { format, isSameDay, isSameMonth, differenceInCalendarDays } from "date-fns";
import { ko } from "date-fns/locale";
import {
  assignCropColors,
  getMonthMatrix,
  cropsForDay,
  monthEvents,
  barEdges,
  type CalendarCrop,
} from "@/lib/utils/crop-calendar";
import { toast } from "sonner";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_BARS_PER_DAY = 3;

const STATUS_LABELS: Record<string, string> = {
  GROWING: "재배 중",
  HARVESTING: "수확 중",
  COMPLETED: "완료",
  FAILED: "실패",
};

export function CropCalendar() {
  const [crops, setCrops] = useState<CalendarCrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState(() => new Date());

  useEffect(() => {
    async function fetchCrops() {
      try {
        const response = await fetch("/api/farm/crops");
        if (!response.ok) throw new Error();
        const data = await response.json();
        setCrops(data.crops || []);
      } catch {
        toast.error("작물 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchCrops();
  }, []);

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const today = new Date();

  // 완료/실패 작기는 캘린더에서 흐리게 구분하기 위해 활성만 막대로 그린다
  const activeCrops = useMemo(
    () => crops.filter((c) => c.status === "GROWING" || c.status === "HARVESTING"),
    [crops]
  );
  const colors = useMemo(() => assignCropColors(activeCrops), [activeCrops]);
  const weeks = useMemo(() => getMonthMatrix(year, month), [year, month]);
  const events = useMemo(
    () => monthEvents(year, month, activeCrops),
    [year, month, activeCrops]
  );

  function moveMonth(delta: number) {
    setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              {format(anchor, "yyyy년 M월", { locale: ko })}
            </CardTitle>
            <CardDescription>
              작기 막대: 파종일 ~ 수확 예정일 (재배·수확 중 작물)
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => moveMonth(-1)} aria-label="이전 달">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              오늘
            </Button>
            <Button variant="outline" size="icon" onClick={() => moveMonth(1)} aria-label="다음 달">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={`py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="divide-y rounded-md border">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 divide-x">
                {week.map((day) => {
                  const dayCrops = cropsForDay(day, activeCrops);
                  const inMonth = isSameMonth(day, anchor);
                  const isToday = isSameDay(day, today);
                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-16 p-1 ${inMonth ? "" : "bg-muted/40"}`}
                    >
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                          isToday
                            ? "bg-primary font-semibold text-primary-foreground"
                            : inMonth
                              ? ""
                              : "text-muted-foreground"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {dayCrops.slice(0, MAX_BARS_PER_DAY).map((c) => {
                          const { isStart, isEnd } = barEdges(day, c);
                          return (
                            <div
                              key={c.id}
                              title={c.name}
                              className={`h-1.5 ${isStart ? "ml-0.5 rounded-l-full" : ""} ${
                                isEnd ? "mr-0.5 rounded-r-full" : ""
                              }`}
                              style={{ backgroundColor: colors.get(c.id) }}
                            />
                          );
                        })}
                        {dayCrops.length > MAX_BARS_PER_DAY && (
                          <p className="text-[10px] leading-none text-muted-foreground">
                            +{dayCrops.length - MAX_BARS_PER_DAY}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 범례 */}
          {activeCrops.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {activeCrops.map((c) => {
                const dday = differenceInCalendarDays(
                  new Date(c.expectedHarvestDate),
                  today
                );
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: colors.get(c.id) }}
                    />
                    <span className="font-medium">
                      {c.name}
                      {c.variety ? ` (${c.variety})` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {dday >= 0 ? `수확 D-${dday}` : STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              재배 중인 작물이 없습니다. 작물 목록 탭에서 작물을 등록하세요.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 이번 달 일정 */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">이번 달 작기 일정</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {events.map((event) => (
                <li
                  key={`${event.cropId}-${event.kind}`}
                  className="flex items-center gap-2"
                >
                  {event.kind === "planting" ? (
                    <Sprout className="h-4 w-4 text-green-600" />
                  ) : (
                    <Wheat className="h-4 w-4 text-amber-600" />
                  )}
                  <span className="w-14 text-muted-foreground">
                    {format(event.date, "M/d (EEE)", { locale: ko })}
                  </span>
                  <span className="font-medium">{event.cropName}</span>
                  <Badge variant="outline">
                    {event.kind === "planting" ? "파종" : "수확 예정"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
