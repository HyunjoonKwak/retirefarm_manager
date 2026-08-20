import { describe, it, expect } from "vitest";
import {
  assignCropColors,
  getMonthMatrix,
  cropsForDay,
  monthEvents,
  barEdges,
  CROP_COLOR_PALETTE,
  type CalendarCrop,
} from "@/lib/utils/crop-calendar";

function crop(overrides: Partial<CalendarCrop> & { id: string }): CalendarCrop {
  return {
    name: overrides.id,
    plantingDate: "2026-03-10T00:00:00.000Z",
    expectedHarvestDate: "2026-06-20T00:00:00.000Z",
    status: "GROWING",
    ...overrides,
  };
}

describe("getMonthMatrix", () => {
  it("주 단위 7일 행렬을 만들고 일요일에서 시작한다", () => {
    const weeks = getMonthMatrix(2026, 7); // 2026년 8월
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0].getDay()).toBe(0); // 일요일
    // 2026-08-01은 토요일 → 첫 주는 7월 26일(일)부터
    expect(weeks[0][0].getDate()).toBe(26);
    expect(weeks.flat().some((d) => d.getMonth() === 7 && d.getDate() === 31)).toBe(true);
  });

  it("모든 달의 날짜 수는 7의 배수다", () => {
    for (let m = 0; m < 12; m++) {
      expect(getMonthMatrix(2026, m).flat().length % 7).toBe(0);
    }
  });
});

describe("assignCropColors", () => {
  it("같은 목록이면 항상 같은 색을 준다", () => {
    const crops = [crop({ id: "a" }), crop({ id: "b" })];
    const first = assignCropColors(crops);
    const second = assignCropColors(crops);
    expect(first.get("a")).toBe(second.get("a"));
    expect(first.get("a")).toBe(CROP_COLOR_PALETTE[0]);
    expect(first.get("b")).toBe(CROP_COLOR_PALETTE[1]);
  });

  it("팔레트를 넘어가면 순환한다", () => {
    const crops = Array.from({ length: CROP_COLOR_PALETTE.length + 1 }, (_, i) =>
      crop({ id: `c${i}` })
    );
    const colors = assignCropColors(crops);
    expect(colors.get(`c${CROP_COLOR_PALETTE.length}`)).toBe(CROP_COLOR_PALETTE[0]);
  });
});

describe("cropsForDay", () => {
  const tomato = crop({
    id: "tomato",
    plantingDate: "2026-03-10T00:00:00+09:00",
    expectedHarvestDate: "2026-06-20T00:00:00+09:00",
  });

  it("작기 기간 안의 날짜에 작물을 반환한다", () => {
    expect(cropsForDay(new Date(2026, 4, 1), [tomato])).toHaveLength(1);
  });

  it("파종일·수확예정일 경계를 포함한다", () => {
    expect(cropsForDay(new Date(2026, 2, 10), [tomato])).toHaveLength(1);
    expect(cropsForDay(new Date(2026, 5, 20), [tomato])).toHaveLength(1);
  });

  it("기간 밖 날짜는 제외한다", () => {
    expect(cropsForDay(new Date(2026, 2, 9), [tomato])).toHaveLength(0);
    expect(cropsForDay(new Date(2026, 5, 21), [tomato])).toHaveLength(0);
  });
});

describe("monthEvents", () => {
  it("해당 월의 파종·수확 이벤트만 날짜순으로 반환한다", () => {
    const crops = [
      crop({
        id: "a",
        name: "토마토",
        plantingDate: "2026-03-25T00:00:00+09:00",
        expectedHarvestDate: "2026-06-20T00:00:00+09:00",
      }),
      crop({
        id: "b",
        name: "상추",
        plantingDate: "2026-03-05T00:00:00+09:00",
        expectedHarvestDate: "2026-04-15T00:00:00+09:00",
      }),
    ];

    const events = monthEvents(2026, 2, crops); // 3월
    expect(events).toHaveLength(2);
    expect(events[0].cropName).toBe("상추");
    expect(events[0].kind).toBe("planting");
    expect(events[1].cropName).toBe("토마토");

    const april = monthEvents(2026, 3, crops); // 4월 — 상추 수확만
    expect(april).toHaveLength(1);
    expect(april[0].kind).toBe("harvest");
  });
});

describe("barEdges", () => {
  const c = crop({
    id: "x",
    plantingDate: "2026-03-10T00:00:00+09:00",
    expectedHarvestDate: "2026-06-20T00:00:00+09:00",
  });

  it("파종일은 시작, 수확예정일은 끝으로 표시한다", () => {
    expect(barEdges(new Date(2026, 2, 10), c)).toEqual({ isStart: true, isEnd: false });
    expect(barEdges(new Date(2026, 5, 20), c)).toEqual({ isStart: false, isEnd: true });
    expect(barEdges(new Date(2026, 4, 1), c)).toEqual({ isStart: false, isEnd: false });
  });
});
