/**
 * 작기(作期) 캘린더 순수 로직 (Asset Hub §6 — ssampin 학기+컬러 라벨 패턴 차용)
 *
 * 작물 하나 = 작기 하나(파종일~수확예정일)로 보고 월간 그리드에 컬러 라벨로
 * 표시한다. UI 렌더링과 분리된 순수 함수만 둔다 (테스트 대상).
 */

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from "date-fns";

export interface CalendarCrop {
  id: string;
  name: string;
  variety?: string | null;
  plantingDate: string; // ISO
  expectedHarvestDate: string; // ISO
  status: string;
}

/** 작기 라벨 팔레트 — 시세 차트 기본색(#3b82f6)과 같은 계열의 범주 색 */
export const CROP_COLOR_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
] as const;

/**
 * 작물 → 색 결정. 목록 순서 기반이라 같은 목록이면 항상 같은 색이 나온다.
 */
export function assignCropColors(
  crops: Array<Pick<CalendarCrop, "id">>
): Map<string, string> {
  return new Map(
    crops.map((crop, index) => [
      crop.id,
      CROP_COLOR_PALETTE[index % CROP_COLOR_PALETTE.length],
    ])
  );
}

/**
 * 해당 월의 주 단위 날짜 행렬 (일요일 시작, 이웃 달 날짜 포함)
 */
export function getMonthMatrix(year: number, month: number): Date[][] {
  const first = startOfMonth(new Date(year, month, 1));
  const days = eachDayOfInterval({
    start: startOfWeek(first, { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(first), { weekStartsOn: 0 }),
  });

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

/** 날짜만 비교하기 위한 자정 정규화 (작기 경계 포함 판정) */
function toDateOnly(value: string | Date): number {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 특정 날짜에 작기가 걸쳐 있는 작물 목록 (파종일·수확예정일 경계 포함)
 */
export function cropsForDay(
  day: Date,
  crops: CalendarCrop[]
): CalendarCrop[] {
  const target = toDateOnly(day);
  return crops.filter(
    (crop) =>
      toDateOnly(crop.plantingDate) <= target &&
      target <= toDateOnly(crop.expectedHarvestDate)
  );
}

export interface CropEvent {
  cropId: string;
  cropName: string;
  date: Date;
  kind: "planting" | "harvest";
}

/**
 * 해당 월의 파종·수확예정 이벤트 (날짜순 정렬)
 */
export function monthEvents(
  year: number,
  month: number,
  crops: CalendarCrop[]
): CropEvent[] {
  const anchor = new Date(year, month, 1);

  const events = crops.flatMap((crop) => {
    const result: CropEvent[] = [];
    const planting = new Date(crop.plantingDate);
    const harvest = new Date(crop.expectedHarvestDate);
    if (isSameMonth(planting, anchor)) {
      result.push({
        cropId: crop.id,
        cropName: crop.name,
        date: planting,
        kind: "planting",
      });
    }
    if (isSameMonth(harvest, anchor)) {
      result.push({
        cropId: crop.id,
        cropName: crop.name,
        date: harvest,
        kind: "harvest",
      });
    }
    return result;
  });

  return [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * 작기 막대가 이 날짜에서 시작/끝나는지 (라운드 처리용)
 */
export function barEdges(
  day: Date,
  crop: CalendarCrop
): { isStart: boolean; isEnd: boolean } {
  return {
    isStart: isSameDay(day, new Date(crop.plantingDate)),
    isEnd: isSameDay(day, new Date(crop.expectedHarvestDate)),
  };
}
