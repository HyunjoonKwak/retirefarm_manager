import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MarketFilterPresets } from "@/components/market/MarketFilterPresets";
import { useMarketPresets } from "@/components/market/useMarketPresets";
import type { SavedFilterPreset } from "@/components/market/marketPriceTypes";

const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

const onApply = vi.fn();

const accountPreset: SavedFilterPreset = {
  id: "srv_1", name: "논산 설향 특", productName: "딸기",
  varieties: ["설향"], origin: "논산", unit: "2kg", grade: "특",
};

function Harness({ accountKey = "user-1" }: { accountKey?: string }) {
  const presets = useMarketPresets(accountKey);
  return (
    <MarketFilterPresets
      productName="딸기"
      varieties={["설향"]}
      origin="논산"
      unit="2kg"
      grade="특"
      presets={presets}
      onApply={onApply}
    />
  );
}

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { status, body } = handler(String(url), init);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("MarketFilterPresets — 계정 저장 조건", () => {
  it("계정 목록을 불러와 보여주고 누르면 조건을 적용한다", async () => {
    stubFetch(() => ({ status: 200, body: { presets: [accountPreset] } }));
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "논산 설향 특" }));
    expect(onApply).toHaveBeenCalledWith(accountPreset);
  });

  it("적용과 삭제가 중첩되지 않은 별도 버튼이라 키보드로 각각 누를 수 있다", async () => {
    stubFetch((url, init) =>
      init?.method === "DELETE"
        ? { status: 200, body: { deleted: true } }
        : { status: 200, body: { presets: [accountPreset] } }
    );
    render(<Harness />);
    const apply = await screen.findByRole("button", { name: "논산 설향 특" });
    const remove = screen.getByRole("button", { name: "논산 설향 특 계정에서 삭제" });
    expect(apply.tagName).toBe("BUTTON");
    expect(remove.tagName).toBe("BUTTON");
    // 버튼 안에 버튼을 넣지 않는다 (초점 이동과 접근성 트리가 깨진다).
    expect(apply.querySelector("button")).toBeNull();
    expect(remove.querySelector("button")).toBeNull();
    expect(apply.contains(remove)).toBe(false);
    expect(remove.contains(apply)).toBe(false);

    remove.focus();
    expect(document.activeElement).toBe(remove);
    fireEvent.click(remove);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("계정에서 삭제했습니다."));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("조회 실패를 '저장된 조건 없음'으로 표시하지 않고 다시 조회를 제공한다", async () => {
    stubFetch(() => ({ status: 500, body: { error: "서버 오류" } }));
    render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("서버 오류");
    expect(screen.queryByText("저장된 조건이 없습니다.")).toBeNull();
    expect(screen.getByRole("button", { name: "다시 조회" })).toBeInTheDocument();
  });

  it("저장 본문에 서버가 정하는 id·userId를 보내지 않는다", async () => {
    const fetchMock = stubFetch((url, init) =>
      init?.method === "POST"
        ? { status: 201, body: { preset: { ...accountPreset, id: "srv_new" } } }
        : { status: 200, body: { presets: [] } }
    );
    render(<Harness />);
    await screen.findByText("저장된 조건이 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: /계정에 저장/ }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(Object.keys(body).sort()).toEqual(["grade", "name", "origin", "productName", "unit", "varieties"]);
    expect(body).toMatchObject({ productName: "딸기", grade: "특", unit: "2kg", varieties: ["설향"] });
  });

  it("저장 실패는 성공으로 표시하지 않고 목록에도 넣지 않는다", async () => {
    stubFetch((url, init) =>
      init?.method === "POST"
        ? { status: 409, body: { error: "비교 조건은 최대 50개까지 저장할 수 있습니다." } }
        : { status: 200, body: { presets: [] } }
    );
    render(<Harness />);
    await screen.findByText("저장된 조건이 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: /계정에 저장/ }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("비교 조건은 최대 50개까지 저장할 수 있습니다.")
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(screen.getByText("저장된 조건이 없습니다.")).toBeInTheDocument();
  });

  it("기기에 남아 있던 조건은 자동으로 올리지 않고, 눌러야 계정에 저장된다", async () => {
    window.localStorage.setItem(
      "market_filterPresets",
      JSON.stringify([{ id: "local_1", name: "이전 기기 조건", productName: "딸기", varieties: [], origin: "논산", unit: null }])
    );
    const fetchMock = stubFetch((url, init) =>
      init?.method === "POST"
        ? { status: 201, body: { preset: { ...accountPreset, id: "srv_from_device", name: "이전 기기 조건" } } }
        : { status: 200, body: { presets: [] } }
    );
    render(<Harness />);
    expect(await screen.findByText("이전 기기 조건")).toBeInTheDocument();
    // 불러오기만으로 계정에 올리지 않는다.
    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit)?.method === "POST")).toBe(false);

    const deviceRow = screen.getByRole("button", { name: "이전 기기 조건" }).closest("li");
    fireEvent.click(within(deviceRow as HTMLElement).getByRole("button", { name: "계정에 저장" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("계정에 비교 조건을 저장했습니다."));
    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body.name).toBe("이전 기기 조건");
    // 이전 형식(등급 없음)도 등급 null로 정규화해 보낸다.
    expect(body.grade).toBeNull();
    expect(body).not.toHaveProperty("id");
  });

  it("계정이 바뀌면 이전 계정의 조건을 남기지 않고 다시 조회한다", async () => {
    const fetchMock = stubFetch((url) =>
      url.includes("presets")
        ? { status: 200, body: { presets: fetchMock.mock.calls.length > 1 ? [] : [accountPreset] } }
        : { status: 200, body: {} }
    );
    const { rerender } = render(<Harness accountKey="user-1" />);
    expect(await screen.findByText("논산 설향 특")).toBeInTheDocument();
    rerender(<Harness accountKey="user-2" />);
    await waitFor(() => expect(screen.queryByText("논산 설향 특")).toBeNull());
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("기기 목록 저장에 실패하면 성공으로 표시하지 않고 항목을 남긴다", async () => {
    window.localStorage.setItem(
      "market_filterPresets",
      JSON.stringify([{ id: "local_1", name: "이전 기기 조건", productName: "딸기", varieties: [], origin: "논산", unit: null }])
    );
    stubFetch(() => ({ status: 200, body: { presets: [] } }));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    render(<Harness />);
    expect(await screen.findByRole("button", { name: "이전 기기 조건" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이전 기기 조건 이 기기에서 삭제" }));

    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining("이 기기에 저장된 목록을 수정하지 못했습니다"));
    expect(toastMock.success).not.toHaveBeenCalled();
    // 저장에 실패했으므로 목록에서 사라진 것처럼 보이면 안 된다.
    expect(screen.getByRole("button", { name: "이전 기기 조건" })).toBeInTheDocument();
    setItem.mockRestore();
  });
});
