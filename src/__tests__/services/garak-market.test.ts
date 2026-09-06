import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseXmlResponse,
  parseGarakResponse,
  GarakResponseError,
  parseKgFromUnit,
  formatDateKey,
  parseYmdDate,
} from "@/lib/services/garak-market";
import { getNextRunTime } from "@/lib/scheduler";
import {
  parseLocalDate,
  formatLocalDateStr,
} from "@/components/market/marketPriceTypes";

describe("parseXmlResponse", () => {
  const makeItem = (fields: Record<string, string>) =>
    `<list>${Object.entries(fields)
      .map(([k, v]) => `<${k}>${v}</${k}>`)
      .join("")}</list>`;

  it("list 태그 항목을 파싱한다", () => {
    const xml = `<response><list_total_count>1</list_total_count>${makeItem({
      PUMMOK: "토마토",
      PUMJONG: "완숙",
      UUN: "10kg",
      PPRICE: "25000",
      SSANGI: "충남 논산",
      CORP_NM: "서울청과",
      ADJ_DT: "20260721",
      QTY: "150",
    })}</response>`;

    const result = parseXmlResponse(xml);
    expect(result.list_total_count).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].PUMMOK).toBe("토마토");
    expect(result.items[0].PPRICE).toBe("25000");
    expect(result.items[0].ADJ_DT).toBe("20260721");
  });

  it("CDATA 형식 값을 파싱한다", () => {
    const xml = `<list_total_count>1</list_total_count><list><PUMMOK><![CDATA[딸기]]></PUMMOK><UUN><![CDATA[2kg]]></UUN><PPRICE><![CDATA[18000]]></PPRICE><CORP_NM><![CDATA[농협(공)]]></CORP_NM><ADJ_DT><![CDATA[20260720]]></ADJ_DT></list>`;
    const result = parseXmlResponse(xml);
    expect(result.items[0].PUMMOK).toBe("딸기");
    expect(result.items[0].CORP_NM).toBe("농협(공)");
  });

  it("row 태그가 더 많으면 row 태그를 사용한다", () => {
    const xml = `<list_total_count>2</list_total_count><row><PUMMOK>무</PUMMOK><UUN>20kg</UUN><PPRICE>9000</PPRICE><CORP_NM>중앙청과</CORP_NM><ADJ_DT>20260719</ADJ_DT></row><row><PUMMOK>배추</PUMMOK><UUN>10kg</UUN><PPRICE>12000</PPRICE><CORP_NM>중앙청과</CORP_NM><ADJ_DT>20260719</ADJ_DT></row>`;
    const result = parseXmlResponse(xml);
    expect(result.items).toHaveLength(2);
    expect(result.items[1].PUMMOK).toBe("배추");
  });

  it("필수 필드(PUMMOK/PPRICE/ADJ_DT) 누락 항목은 제외한다", () => {
    const xml = `<list_total_count>2</list_total_count>${makeItem({
      PUMMOK: "토마토",
      UUN: "10kg",
      PPRICE: "25000",
      CORP_NM: "서울청과",
      ADJ_DT: "20260721",
    })}${makeItem({ PUMMOK: "불량", UUN: "5kg", CORP_NM: "서울청과" })}`;
    const result = parseXmlResponse(xml);
    expect(result.items).toHaveLength(1);
  });

  it("건수 태그가 없는 응답은 0건이 아니라 해석 실패로 본다", () => {
    expect(() => parseXmlResponse("<response></response>")).toThrow(GarakResponseError);
    expect(parseGarakResponse("<response></response>")).toMatchObject({ kind: "invalid", reason: "missing_count" });
  });

  it("건수 0이 명시된 응답만 정상 0건이다", () => {
    const result = parseXmlResponse("<response><list_total_count>0</list_total_count></response>");
    expect(result.list_total_count).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("HTML·오류 XML·빈 본문·항목 파싱 실패를 각각 구분한다", () => {
    expect(parseGarakResponse("<!DOCTYPE html><html><body>로그인</body></html>")).toMatchObject({ kind: "invalid", reason: "html" });
    expect(parseGarakResponse("<html lang=\"ko\"><head><title>서울시농수산식품공사</title></head></html>")).toMatchObject({ kind: "invalid", reason: "html" });
    const errorXml = parseGarakResponse("<response><error>Invalid ID for secret-user</error></response>");
    expect(errorXml).toMatchObject({ kind: "invalid", reason: "error_xml", detail: "오류 XML 응답 (<error> 태그)" });
    // 본문(자격증명이 반사될 수 있음)은 detail에 넣지 않는다
    expect(JSON.stringify(errorXml)).not.toContain("secret-user");
    expect(parseGarakResponse("<list_total_count>0</list_total_count><list><PUMMOK>무</PUMMOK><PPRICE>1</PPRICE><CORP_NM>a</CORP_NM><ADJ_DT>20260901</ADJ_DT></list>")).toMatchObject({ kind: "invalid", reason: "count_mismatch" });
    expect(parseGarakResponse("   ")).toMatchObject({ kind: "invalid", reason: "empty" });
    expect(parseGarakResponse("<response><list_total_count>5</list_total_count><item>새 형식</item></response>")).toMatchObject({ kind: "invalid", reason: "no_items" });
  });
});

describe("parseKgFromUnit", () => {
  it("kg 단위를 추출한다", () => {
    expect(parseKgFromUnit("10kg")).toBe(10);
    expect(parseKgFromUnit("5KG")).toBe(5);
    expect(parseKgFromUnit("2.5kg")).toBe(2.5);
    expect(parseKgFromUnit("10 kg")).toBe(10);
  });

  it("kg가 없으면 null을 반환한다", () => {
    expect(parseKgFromUnit("")).toBeNull();
    expect(parseKgFromUnit("1박스")).toBeNull();
    expect(parseKgFromUnit("g")).toBeNull();
  });
});

describe("날짜 유틸 (타임존 안전성)", () => {
  it("formatDateKey는 로컬 자정 기준 날짜를 유지한다", () => {
    // toISOString()과 달리 로컬 자정이 하루 밀리지 않아야 함
    const localMidnight = new Date(2026, 6, 22); // 2026-07-22 00:00 local
    expect(formatDateKey(localMidnight)).toBe("2026-07-22");
  });

  it("parseYmdDate는 YYYYMMDD를 로컬 자정으로 변환한다", () => {
    const d = parseYmdDate("20260722");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(22);
    expect(d.getHours()).toBe(0);
  });

  it("parseYmdDate → formatDateKey 왕복이 일치한다", () => {
    expect(formatDateKey(parseYmdDate("20261231"))).toBe("2026-12-31");
    expect(formatDateKey(parseYmdDate("20260101"))).toBe("2026-01-01");
  });

  it("클라이언트 parseLocalDate/formatLocalDateStr 왕복이 일치한다", () => {
    expect(formatLocalDateStr(parseLocalDate("2026-07-22"))).toBe("2026-07-22");
    expect(formatLocalDateStr(parseLocalDate("2026-07-22T00:00:00.000Z"))).toBe(
      "2026-07-22"
    );
  });
});

describe("getNextRunTime", () => {
  afterEach(() => vi.useRealTimers());
  it("수집 요일이 없으면 null을 반환한다", () => {
    expect(getNextRunTime("09:30", "")).toBeNull();
  });

  it("다음 실행 시간은 항상 미래이고 지정 요일에 속한다", () => {
    const next = getNextRunTime("09:30", "1,2,3,4,5");
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(Date.now());
    expect([1, 2, 3, 4, 5]).toContain(next!.getDay());
    expect(next!.getHours()).toBe(9);
    expect(next!.getMinutes()).toBe(30);
  });

  it("단일 요일 설정도 7일 내에서 찾는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 6, 8, 0));
    const next = getNextRunTime("06:00", "0"); // 일요일
    expect(next).not.toBeNull();
    expect(next!.getDay()).toBe(0);
    expect(next!.getDate()).toBe(13);
  });
});
