// @vitest-environment node
// hwpxcore의 XML 직렬화가 jsdom의 DOM 구현과 충돌해 node 환경에서 실행한다
// (실제 런타임도 Next nodejs 라우트다)
import { describe, it, expect } from "vitest";
import {
  buildFarmingLogRows,
  generateFarmingLogHwpx,
  LOG_TABLE_HEADER,
  type HwpxLog,
} from "@/lib/services/farming-log-hwpx";

function log(overrides: Partial<HwpxLog>): HwpxLog {
  return {
    date: new Date(2026, 7, 15),
    weather: "맑음",
    temperature: 28,
    notes: null,
    content: null,
    activities: [],
    ...overrides,
  };
}

describe("buildFarmingLogRows", () => {
  it("활동 1건 = 1행, 작물·수량을 내용에 합친다", () => {
    const rows = buildFarmingLogRows([
      log({
        activities: [
          {
            type: "HARVESTING",
            description: "1동 수확",
            quantity: 20,
            unit: "kg",
            crop: { name: "토마토" },
          },
          {
            type: "WATERING",
            description: "전체 관수",
            quantity: null,
            unit: null,
            crop: null,
          },
        ],
      }),
    ]);

    expect(rows).toEqual([
      ["8/15", "맑음", "28", "수확", "[토마토] 1동 수확 (20kg)"],
      ["8/15", "맑음", "28", "관수", "전체 관수"],
    ]);
  });

  it("BlockNote 본문이 있으면 '기록' 행을 추가한다", () => {
    const content = JSON.stringify([
      {
        type: "paragraph",
        content: [{ type: "text", text: "태풍 대비 점검 완료", styles: {} }],
        children: [],
      },
    ]);
    const rows = buildFarmingLogRows([log({ content })]);
    expect(rows).toEqual([["8/15", "맑음", "28", "기록", "태풍 대비 점검 완료"]]);
  });

  it("활동·본문이 없으면 한 줄 요약으로 1행을 만든다", () => {
    const rows = buildFarmingLogRows([
      log({ notes: "휴무", weather: null, temperature: null }),
    ]);
    expect(rows).toEqual([["8/15", "", "", "기록", "휴무"]]);
  });
});

describe("generateFarmingLogHwpx", () => {
  it("Skeleton 템플릿으로 유효한 HWPX(ZIP) 바이너리를 만든다", async () => {
    const bytes = await generateFarmingLogHwpx({
      yearMonth: "2026-08",
      farm: {
        userName: "홍길동",
        region: "충북 괴산군",
        farmingType: "GREENHOUSE",
        areaPyeong: 1500,
      },
      logs: [
        log({
          activities: [
            {
              type: "SEEDING",
              description: "상추 파종",
              quantity: null,
              unit: null,
              crop: { name: "상추" },
            },
          ],
        }),
      ],
    });

    expect(bytes.length).toBeGreaterThan(1000);
    // ZIP(OPC 컨테이너) 매직 넘버 "PK"
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(LOG_TABLE_HEADER).toHaveLength(5);
  });
});
