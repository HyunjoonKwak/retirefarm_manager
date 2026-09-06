import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMarketPresets, type PresetActionResult } from "@/components/market/useMarketPresets";
import type { PresetPayload, SavedFilterPreset } from "@/components/market/marketPriceTypes";

const presetA: SavedFilterPreset = {
  id: "srv_a", name: "논산 설향 특", productName: "딸기",
  varieties: ["설향"], origin: "논산", unit: "2kg", grade: "특",
};
const presetB: SavedFilterPreset = { ...presetA, id: "srv_b", name: "진주 죽향" };

const payload: PresetPayload = {
  name: "논산 설향 특", productName: "딸기", varieties: ["설향"], origin: "논산", unit: "2kg", grade: "특",
};

interface PendingCall {
  url: string;
  method: string;
  settled: boolean;
  settle: (status: number, body: unknown) => void;
}

/** 응답 시점을 테스트가 직접 정한다 (늦게 도착한 응답 재현용). */
function createFetchMock() {
  const calls: PendingCall[] = [];
  const fetchMock = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        const call: PendingCall = {
          url: String(url),
          method: (init?.method ?? "GET").toUpperCase(),
          settled: false,
          settle: (status, body) => {
            call.settled = true;
            resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
          },
        };
        calls.push(call);
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  const of = (method: string) => calls.filter((call) => call.method === method);
  return {
    calls,
    of,
    /** method의 n번째 요청 (0-base) */
    at: (method: string, index = 0) => {
      const call = of(method)[index];
      if (!call) throw new Error(`${method} 요청 ${index}번이 없습니다 (총 ${of(method).length}건)`);
      return call;
    },
    pending: (method: string) => of(method).filter((call) => !call.settled).length,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("useMarketPresets — 계정 세대 가드", () => {
  it("계정이 바뀐 뒤 도착한 저장 응답은 새 계정 목록·상태를 바꾸지 않는다", async () => {
    const http = createFetchMock();
    const { result, rerender } = renderHook(({ key }) => useMarketPresets(key), {
      initialProps: { key: "user-1" },
    });
    await act(async () => http.at("GET", 0).settle(200, { presets: [presetA] }));
    expect(result.current.accountPresets).toEqual([presetA]);

    let saving!: Promise<PresetActionResult>;
    act(() => {
      saving = result.current.saveToAccount(payload);
    });
    expect(result.current.saving).toBe(true);

    rerender({ key: "user-2" });
    await act(async () => http.at("GET", 1).settle(200, { presets: [presetB] }));
    expect(result.current.accountPresets).toEqual([presetB]);

    // 이전 계정에서 시작한 저장이 뒤늦게 성공한다.
    let outcome!: PresetActionResult;
    await act(async () => {
      http.at("POST", 0).settle(201, { preset: { ...presetA, id: "srv_new" } });
      outcome = await saving;
    });

    expect(outcome).toEqual({ ok: true, applied: false });
    expect(result.current.accountPresets).toEqual([presetB]);
    expect(result.current.saving).toBe(false);
    expect(result.current.status).toBe("ready");
  });

  it("계정이 바뀐 뒤 도착한 삭제 응답은 새 계정의 같은 id를 지우지 않는다", async () => {
    const http = createFetchMock();
    const { result, rerender } = renderHook(({ key }) => useMarketPresets(key), {
      initialProps: { key: "user-1" },
    });
    await act(async () => http.at("GET", 0).settle(200, { presets: [presetA] }));

    let deleting!: Promise<PresetActionResult>;
    act(() => {
      deleting = result.current.deleteAccountPreset(presetA.id);
    });

    rerender({ key: "user-2" });
    // 새 계정에도 우연히 같은 id의 조건이 있을 수 있다.
    await act(async () => http.at("GET", 1).settle(200, { presets: [presetA] }));

    let outcome!: PresetActionResult;
    await act(async () => {
      http.at("DELETE", 0).settle(200, { deleted: true });
      outcome = await deleting;
    });

    expect(outcome).toEqual({ ok: true, applied: false });
    expect(result.current.accountPresets).toEqual([presetA]);
    expect(result.current.status).toBe("ready");
  });

  it("계정이 바뀌면 이전 계정 목록을 그대로 내보내지 않는다", async () => {
    const http = createFetchMock();
    const { result, rerender } = renderHook(({ key }) => useMarketPresets(key), {
      initialProps: { key: "user-1" },
    });
    await act(async () => http.at("GET", 0).settle(200, { presets: [presetA] }));
    expect(result.current.accountPresets).toEqual([presetA]);

    rerender({ key: "user-2" });
    expect(result.current.accountPresets).toEqual([]);
    expect(result.current.status).toBe("loading");
    expect(result.current.saving).toBe(false);
    expect(http.pending("GET")).toBe(1);
  });
});

describe("useMarketPresets — 진행 중 조회와 변경의 순서", () => {
  it("조회 중 저장이 성공하면 오래된 조회 응답이 결과를 덮지 않는다", async () => {
    const http = createFetchMock();
    const { result } = renderHook(() => useMarketPresets("user-1"));
    expect(result.current.status).toBe("loading");

    const created = { ...presetA, id: "srv_new", name: "새 조건" };
    let saving!: Promise<PresetActionResult>;
    act(() => {
      saving = result.current.saveToAccount(payload);
    });
    await act(async () => {
      http.at("POST", 0).settle(201, { preset: created });
      await saving;
    });

    // 저장이 성공하면 진행 중이던 조회를 끊고 다시 조회한다.
    await waitFor(() => expect(http.of("GET").length).toBe(2));
    await act(async () => http.at("GET", 1).settle(200, { presets: [created, presetA] }));
    expect(result.current.accountPresets).toEqual([created, presetA]);

    // 첫 조회가 뒤늦게 도착해도 최신 목록을 덮지 않는다.
    await act(async () => http.at("GET", 0).settle(200, { presets: [] }));
    expect(result.current.accountPresets).toEqual([created, presetA]);
    expect(result.current.status).toBe("ready");
  });

  it("조회 중 삭제가 성공해도 오래된 조회 응답이 삭제된 항목을 되살리지 않는다", async () => {
    const http = createFetchMock();
    const { result } = renderHook(() => useMarketPresets("user-1"));

    let deleting!: Promise<PresetActionResult>;
    act(() => {
      deleting = result.current.deleteAccountPreset(presetA.id);
    });
    await act(async () => {
      http.at("DELETE", 0).settle(200, { deleted: true });
      await deleting;
    });

    await waitFor(() => expect(http.of("GET").length).toBe(2));
    await act(async () => http.at("GET", 1).settle(200, { presets: [presetB] }));
    await act(async () => http.at("GET", 0).settle(200, { presets: [presetA, presetB] }));
    expect(result.current.accountPresets).toEqual([presetB]);
  });

  it("저장 실패는 목록을 바꾸지 않고 이유를 돌려준다", async () => {
    const http = createFetchMock();
    const { result } = renderHook(() => useMarketPresets("user-1"));
    await act(async () => http.at("GET", 0).settle(200, { presets: [presetA] }));

    let outcome!: PresetActionResult;
    await act(async () => {
      const saving = result.current.saveToAccount(payload);
      http.at("POST", 0).settle(409, { error: "비교 조건은 최대 50개까지 저장할 수 있습니다." });
      outcome = await saving;
    });

    expect(outcome).toEqual({ ok: false, applied: false, error: "비교 조건은 최대 50개까지 저장할 수 있습니다." });
    expect(result.current.accountPresets).toEqual([presetA]);
    expect(result.current.saving).toBe(false);
  });
});

it("ignores a mutation from an earlier visit to the same account", async () => {
  const http = createFetchMock();
  const { result, rerender } = renderHook(({ key }) => useMarketPresets(key), { initialProps: { key: "A" } });
  await act(async () => http.at("GET", 0).settle(200, { presets: [presetA] }));
  let saving!: Promise<PresetActionResult>;
  act(() => { saving = result.current.saveToAccount(payload); });
  rerender({ key: "B" }); rerender({ key: "A" });
  await act(async () => http.at("GET", 2).settle(200, { presets: [] }));
  let outcome!: PresetActionResult;
  await act(async () => { http.at("POST").settle(201, { preset: presetA }); outcome = await saving; });
  expect(outcome.applied).toBe(false); expect(result.current.accountPresets).toEqual([]);
});
it("does not report an applied save after the screen unmounts", async () => {
  const http = createFetchMock(); const { result, unmount } = renderHook(() => useMarketPresets("A"));
  await act(async () => http.at("GET").settle(200, { presets: [] }));
  let saving!: Promise<PresetActionResult>; act(() => { saving = result.current.saveToAccount(payload); });
  unmount(); http.at("POST").settle(201, { preset: presetA });
  expect((await saving).applied).toBe(false);
});
