import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, loggerMock } = vi.hoisted(() => ({
  prismaMock: {
    auctionResult: { findMany: vi.fn(), createMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    dataCollectionLog: { create: vi.fn() },
    marketCollectionSettings: { findMany: vi.fn() },
  },
  loggerMock: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

import {
  collectAndSaveAuctionData,
  fetchAuctionPage,
  aggregateStatus,
  GarakFetchError,
  FETCH_RETRY_DELAYS_MS,
  MAX_PAGES,
  type CollectorDeps,
} from "@/lib/services/garak-collector";

const SECRET = "super-secret-pass";
const DATE = new Date(2026, 8, 5);

function item(i: number, page: number) {
  return `<list><PUMMOK>토마토</PUMMOK><PUMJONG>완숙</PUMJONG><UUN>10kg</UUN><PPRICE>${20000 + page * 100 + i}</PPRICE><SSANGI>충남 논산</SSANGI><CORP_NM>서울청과</CORP_NM><ADJ_DT>20260905</ADJ_DT><QTY>${i + 1}</QTY></list>`;
}

function xmlPage(totalCount: number, page: number, itemsOnPage: number = 100): string {
  const rows = Array.from({ length: itemsOnPage }, (_, i) => item(i, page)).join("");
  return `<response><list_total_count>${totalCount}</list_total_count>${rows}</response>`;
}

function fakeResponse(body: string, status: number = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response;
}

function pageOf(url: string): number {
  return Number(new URL(url).searchParams.get("pageidx"));
}

function deps(fetchImpl: (url: string) => Promise<Response>): CollectorDeps {
  return { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: vi.fn(async () => {}) };
}

function allText(): string {
  return JSON.stringify([
    ...loggerMock.info.mock.calls,
    ...loggerMock.warn.mock.calls,
    ...loggerMock.error.mock.calls,
    ...prismaMock.dataCollectionLog.create.mock.calls,
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GARAK_API_ID = "test-id";
  process.env.GARAK_API_PASSWORD = SECRET;
  delete process.env.GARAK_API_URL;
  prismaMock.auctionResult.findMany.mockResolvedValue([]);
  prismaMock.auctionResult.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  prismaMock.dataCollectionLog.create.mockResolvedValue({});
});

describe("collectAndSaveAuctionData — 응답 검증 (P1)", () => {
  it("HTML 200 응답은 0건이 아니라 FAILED로 기록하고 저장하지 않는다 (재시도 후)", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse("<!DOCTYPE html><html><body>login</body></html>"));
    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(fetchImpl));

    expect(result.status).toBe("FAILED");
    expect(result.noAuction).toBe(false);
    expect(result.complete).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(FETCH_RETRY_DELAYS_MS.length + 1);
    expect(prismaMock.auctionResult.createMany).not.toHaveBeenCalled();
    const log = prismaMock.dataCollectionLog.create.mock.calls[0][0].data;
    expect(log.status).toBe("FAILED");
    expect(log.errorMessage).toContain("html");
    expect(result.guidance).toContain("다시 수집");
  });

  it("list_total_count가 없는 XML과 오류 XML은 FAILED다", async () => {
    const missing = await collectAndSaveAuctionData(
      DATE, ["11000101"], "토마토",
      deps(vi.fn(async () => fakeResponse("<response><result>OK</result></response>")))
    );
    expect(missing.status).toBe("FAILED");
    expect(missing.issues[0]).toContain("missing_count");

    const errorXml = await collectAndSaveAuctionData(
      DATE, ["11000101"], "딸기",
      deps(vi.fn(async () => fakeResponse("<response><error>Invalid ID</error></response>")))
    );
    expect(errorXml.status).toBe("FAILED");
    expect(errorXml.issues[0]).toContain("error_xml");
    // 외부 본문은 반사하지 않는다
    expect(errorXml.issues[0]).not.toContain("Invalid ID");

    const mismatch = await collectAndSaveAuctionData(
      DATE, ["11000101"], "무",
      deps(vi.fn(async () => fakeResponse(`<response><list_total_count>0</list_total_count>${item(0, 1)}</response>`)))
    );
    expect(mismatch.status).toBe("FAILED");
    expect(mismatch.issues[0]).toContain("count_mismatch");
  });

  it("가격·수량·일자가 유효하지 않은 항목은 0/1로 보정하지 않고 제외하며 PARTIAL로 알린다", async () => {
    const bad = (fields: Record<string, string>) =>
      `<list>${Object.entries({ PUMMOK: "토마토", UUN: "10kg", CORP_NM: "서울청과", ADJ_DT: "20260905", PPRICE: "1000", QTY: "2", ...fields })
        .map(([k, v]) => `<${k}>${v}</${k}>`).join("")}</list>`;
    const body = `<response><list_total_count>4</list_total_count>${bad({})}${bad({ PPRICE: "abc" })}${bad({ QTY: "0" })}${bad({ ADJ_DT: "2026-09-05" })}</response>`;
    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(vi.fn(async () => fakeResponse(body))));

    expect(result.status).toBe("PARTIAL");
    const product = result.corporations[0].products[0];
    expect(product.invalidCount).toBe(3);
    expect(product.fetchedCount).toBe(1);
    expect(result.issues.join(" ")).toContain("유효하지 않은 항목 3건 제외");
    expect(result.issues.join(" ")).toContain("invalid_price 1");
    expect(prismaMock.auctionResult.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it("건수 0이 명시된 정상 XML만 EMPTY이며 휴장으로 확정하지 않는다", async () => {
    const result = await collectAndSaveAuctionData(
      DATE, ["11000101"], "토마토", deps(vi.fn(async () => fakeResponse(xmlPage(0, 1, 0))))
    );
    expect(result.status).toBe("EMPTY");
    expect(result.noAuction).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.guidance).toContain("휴장 여부는 확정하지 않습니다");
    const log = prismaMock.dataCollectionLog.create.mock.calls[0][0].data;
    expect(log.status).toBe("EMPTY");
  });
});

describe("collectAndSaveAuctionData — 부분 수집 (P1)", () => {
  it("100건 페이지 기준으로 480건을 정확히 5번 요청하고 정상 완료한다", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.get("pagesize")).toBe("100");
      const page = pageOf(url);
      expect(page).toBeLessThanOrEqual(5);
      return fakeResponse(xmlPage(480, page, page === 5 ? 80 : 100));
    });
    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(fetchImpl));
    expect(result.status).toBe("SUCCESS");
    expect(result.totalCount).toBe(480);
    expect(result.newCount).toBe(480);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("일부 페이지가 실패하면 PARTIAL이고 성공한 페이지는 저장하며 재실행 안내를 남긴다", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const page = pageOf(url);
      if (page === 2) throw new Error("socket hang up");
      return fakeResponse(xmlPage(205, page, page === 3 ? 5 : 100));
    });
    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(fetchImpl));

    expect(result.status).toBe("PARTIAL");
    expect(result.complete).toBe(false);
    expect(result.totalCount).toBe(205);
    expect(result.corporations[0].products[0].failedPages).toEqual([2]);
    expect(result.issues.join(" ")).toContain("페이지 1개 조회 실패 (2)");
    expect(prismaMock.auctionResult.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.auctionResult.createMany.mock.calls[0][0].data).toHaveLength(105);
    const log = prismaMock.dataCollectionLog.create.mock.calls[0][0].data;
    expect(log.status).toBe("PARTIAL");
    expect(log.errorMessage).toContain("다시 수집");
  });

  it("100페이지 상한을 넘으면 PARTIAL로 알린다", async () => {
    const fetchImpl = vi.fn(async (url: string) => fakeResponse(xmlPage(15000, pageOf(url))));
    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(fetchImpl));
    expect(result.status).toBe("PARTIAL");
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_PAGES);
    expect(result.issues.join(" ")).toContain(`150페이지 중 ${MAX_PAGES}페이지만 수집`);
    expect(result.corporations[0].products[0].capped).toBe(true);
    // 동일 조건 재수집으로는 채워지지 않으므로 범위 축소/상한 확대를 안내한다
    expect(result.guidance).toContain("품목을 나눠");
    expect(prismaMock.dataCollectionLog.create.mock.calls[0][0].data.errorMessage).toContain("상한 확대");
  });

  it("마지막 페이지가 아닌데 100건 미만이면 항목 누락 의심으로 PARTIAL", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const page = pageOf(url);
      return fakeResponse(xmlPage(300, page, page === 2 ? 4 : 100));
    });
    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(fetchImpl));
    expect(result.status).toBe("PARTIAL");
    expect(result.issues.join(" ")).toContain("항목 누락 의심");
  });

  it("상한·실패 페이지가 없어도 파싱 항목이 API 총 건수보다 적으면 PARTIAL이다", async () => {
    // 단일 페이지: 총 5건인데 3건만 파싱
    const single = await collectAndSaveAuctionData(
      DATE, ["11000101"], "토마토", deps(vi.fn(async () => fakeResponse(xmlPage(5, 1, 3))))
    );
    expect(single.status).toBe("PARTIAL");
    expect(single.issues.join(" ")).toContain("API 총 5건 중 3건만 파싱됨 (누락 2건)");
    expect(single.corporations[0].products[0].failedPages).toEqual([]);

    // 두 페이지: 총 105건인데 100 + 3건 (마지막 페이지가 짧아 shortPages로는 잡히지 않음)
    const fetchImpl = vi.fn(async (url: string) => {
      const page = pageOf(url);
      return fakeResponse(xmlPage(105, page, page === 2 ? 3 : 100));
    });
    const twoPages = await collectAndSaveAuctionData(DATE, ["11000101"], "딸기", deps(fetchImpl));
    expect(twoPages.status).toBe("PARTIAL");
    expect(twoPages.issues.join(" ")).toContain("누락 2건");
  });

  it("여러 법인 중 하나만 실패하면 전체는 PARTIAL, 모두 실패하면 FAILED", () => {
    expect(aggregateStatus(["SUCCESS", "FAILED"])).toBe("PARTIAL");
    expect(aggregateStatus(["FAILED", "FAILED"])).toBe("FAILED");
    expect(aggregateStatus(["EMPTY", "EMPTY"])).toBe("EMPTY");
    expect(aggregateStatus(["EMPTY", "SUCCESS"])).toBe("SUCCESS");
    expect(aggregateStatus(["PARTIAL", "SUCCESS"])).toBe("PARTIAL");
  });
});

describe("collectAndSaveAuctionData — DB 오류 (P2)", () => {
  const okFetch = () => vi.fn(async (url: string) => fakeResponse(xmlPage(3, pageOf(url), 3)));

  it("P2002만 중복으로 세고 나머지 행은 저장한다", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    prismaMock.auctionResult.createMany.mockRejectedValueOnce(p2002);
    prismaMock.auctionResult.create
      .mockRejectedValueOnce(p2002)
      .mockResolvedValue({});

    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(okFetch()));
    expect(result.status).toBe("SUCCESS");
    expect(result.newCount).toBe(2);
    expect(result.duplicateCount).toBe(1);
  });

  it("P2002가 아닌 DB 오류는 FAILED로 전파된다", async () => {
    prismaMock.auctionResult.createMany.mockRejectedValueOnce(new Error("SQLITE_IOERR: disk I/O error"));
    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(okFetch()));
    expect(result.status).toBe("FAILED");
    expect(result.issues[0]).toContain("저장 실패: SQLITE_IOERR");
    expect(prismaMock.auctionResult.create).not.toHaveBeenCalled();
    expect(prismaMock.dataCollectionLog.create.mock.calls[0][0].data.status).toBe("FAILED");
  });
});

describe("fetchAuctionPage — 타임아웃·재시도·자격증명 (P2)", () => {
  it("네트워크 오류는 제한 재시도 후 성공할 수 있다", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(fakeResponse(xmlPage(1, 1, 1)));
    const sleep = vi.fn(async () => {});
    const page = await fetchAuctionPage({ date: DATE, productName: "토마토" }, { fetchImpl, sleep });
    expect(page.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(FETCH_RETRY_DELAYS_MS[0]);
  });

  it("타임아웃은 재시도 횟수를 다 쓰면 GarakFetchError(timeout)", async () => {
    const timeoutError = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    const fetchImpl = vi.fn().mockRejectedValue(timeoutError);
    await expect(fetchAuctionPage({ date: DATE }, { fetchImpl, sleep: vi.fn(async () => {}) })).rejects.toMatchObject({
      name: "GarakFetchError",
      stage: "timeout",
      attempts: FETCH_RETRY_DELAYS_MS.length + 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(FETCH_RETRY_DELAYS_MS.length + 1);
  });

  it("HTTP 401 같은 4xx는 재시도하지 않는다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse("denied", 401));
    await expect(fetchAuctionPage({ date: DATE }, { fetchImpl })).rejects.toBeInstanceOf(GarakFetchError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("요청 URL은 HTTPS이고 자격증명은 오류 메시지·로그·수집 로그에 남지 않는다", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse("<html><body>oops</body></html>"));
    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(fetchImpl));

    const requestedUrl = (fetchImpl.mock.calls as unknown as string[][])[0][0];
    expect(requestedUrl.startsWith("https://www.garak.co.kr/")).toBe(true);
    expect(requestedUrl).toContain(`passwd=${SECRET}`);

    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(allText()).not.toContain(SECRET);
    expect(allText()).not.toContain("garak.co.kr");
  });

  it("GARAK_API_URL은 https만 허용하고 리디렉션은 오류로 막는다", async () => {
    process.env.GARAK_API_URL = "http://www.garak.co.kr/homepage/publicdata/dataOpen.do";
    const fetchImpl = vi.fn(async () => fakeResponse(xmlPage(0, 1, 0)));
    await expect(fetchAuctionPage({ date: DATE }, { fetchImpl })).rejects.toThrow("https만 허용");
    expect(fetchImpl).not.toHaveBeenCalled();

    process.env.GARAK_API_URL = "https://mirror.example.com/dataOpen.do";
    await fetchAuctionPage({ date: DATE }, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith("https://mirror.example.com/")).toBe(true);
    expect(init.redirect).toBe("error");
  });

  it("네트워크 오류 메시지에 URL이 섞여 있어도 자격증명은 남지 않는다", async () => {
    const leaky = Object.assign(
      new Error(`request to https://www.garak.co.kr/dataOpen.do?id=test-id&passwd=${SECRET} failed`),
      { code: "ECONNRESET" }
    );
    const fetchImpl = vi.fn().mockRejectedValue(leaky);
    const result = await collectAndSaveAuctionData(DATE, ["11000101"], "토마토", deps(fetchImpl));
    expect(result.status).toBe("FAILED");
    expect(result.issues[0]).toContain("ECONNRESET");
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(allText()).not.toContain(SECRET);
  });

  it("본문 읽기(text) 중 오류도 재시도 범위에 들어간다", async () => {
    const brokenBody = { ok: true, status: 200, text: async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); } } as unknown as Response;
    const fetchImpl = vi.fn().mockResolvedValueOnce(brokenBody).mockResolvedValueOnce(fakeResponse(xmlPage(1, 1, 1)));
    const page = await fetchAuctionPage({ date: DATE }, { fetchImpl, sleep: vi.fn(async () => {}) });
    expect(page.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("collectAndSaveAuctionData — 프로세스 내 중복 실행 억제 (P2)", () => {
  it("같은 날짜·법인·품목 수집이 진행 중이면 두 번째 호출은 결과를 공유한다", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchImpl = vi.fn(async (url: string) => {
      await gate;
      return fakeResponse(xmlPage(2, pageOf(url), 2));
    });
    const d = deps(fetchImpl);

    const first = collectAndSaveAuctionData(DATE, ["11000101"], "토마토,딸기", d);
    const second = collectAndSaveAuctionData(DATE, ["11000101"], " 딸기 , 토마토", d);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(a.deduplicated).toBe(false);
    expect(b.deduplicated).toBe(true);
    expect(b.newCount).toBe(a.newCount);
    // 품목 2개 × 페이지 1 = 2회만 호출 (두 번째 호출은 새 요청을 만들지 않음)
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(prismaMock.dataCollectionLog.create).toHaveBeenCalledTimes(1);
  });
});
