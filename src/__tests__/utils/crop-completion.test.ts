import { describe, it, expect } from "vitest";
import { resolveCropCompletion, resolveCropEndDate } from "@/lib/utils/crop-completion";

const NOW = new Date(2026, 8, 6, 10, 0, 0);
const LEGACY_UPDATED_AT = new Date(2026, 5, 20, 8, 0, 0);

describe("resolveCropCompletion", () => {
  it("GROWING → COMPLETED 전이 시 now를 기록한다", () => {
    const result = resolveCropCompletion(
      { status: "GROWING", completedAt: null, updatedAt: LEGACY_UPDATED_AT },
      { status: "COMPLETED" },
      NOW
    );
    expect(result).toEqual({ completedAt: NOW, estimated: false });
  });

  it("요청에 completedAt이 있으면 그 값을 쓴다", () => {
    const explicit = new Date(2026, 8, 1);
    const result = resolveCropCompletion(
      { status: "COMPLETED", completedAt: NOW, updatedAt: NOW },
      { completedAt: explicit },
      NOW
    );
    expect(result).toEqual({ completedAt: explicit, estimated: false });
  });

  it("종료 상태에서 GROWING으로 되돌리면 completedAt을 지운다", () => {
    const result = resolveCropCompletion(
      { status: "COMPLETED", completedAt: NOW, updatedAt: NOW },
      { status: "GROWING" },
      NOW
    );
    expect(result).toEqual({ completedAt: null, estimated: false });
  });

  it("비종료 상태 편집은 completedAt을 건드리지 않는다", () => {
    const result = resolveCropCompletion(
      { status: "GROWING", completedAt: null, updatedAt: NOW },
      { growthStage: "FLOWERING" } as never,
      NOW
    );
    expect(result.completedAt).toBeUndefined();
  });

  it("레거시 완료 행(completedAt null)은 첫 편집에서 편집 전 updatedAt으로 고정한다", () => {
    const result = resolveCropCompletion(
      { status: "COMPLETED", completedAt: null, updatedAt: LEGACY_UPDATED_AT },
      { notes: "메모 수정" } as never,
      NOW
    );
    expect(result).toEqual({ completedAt: LEGACY_UPDATED_AT, estimated: true });
  });

  it("이미 completedAt이 있는 종료 행의 일반 편집은 변경 없음", () => {
    const fixed = new Date(2026, 7, 1);
    const result = resolveCropCompletion(
      { status: "FAILED", completedAt: fixed, updatedAt: NOW },
      { status: "COMPLETED" },
      NOW
    );
    expect(result.completedAt).toBeUndefined();
  });
});

describe("resolveCropEndDate", () => {
  it("진행 중이면 now, completedAt이 있으면 그 값, 없으면 updatedAt(추정)", () => {
    expect(resolveCropEndDate({ status: "GROWING", completedAt: null, updatedAt: LEGACY_UPDATED_AT }, NOW))
      .toEqual({ endDate: NOW, estimated: false });
    const fixed = new Date(2026, 7, 1);
    expect(resolveCropEndDate({ status: "COMPLETED", completedAt: fixed, updatedAt: NOW }, NOW))
      .toEqual({ endDate: fixed, estimated: false });
    expect(resolveCropEndDate({ status: "FAILED", completedAt: null, updatedAt: LEGACY_UPDATED_AT }, NOW))
      .toEqual({ endDate: LEGACY_UPDATED_AT, estimated: true });
  });
});

it("추정 완료일은 일반 편집과 재조회 후에도 추정 표시를 유지하고, 명시적 교정 시에만 해제한다", () => {
  const legacy = { status: "COMPLETED", completedAt: null, updatedAt: LEGACY_UPDATED_AT };
  const first = resolveCropCompletion(legacy, {}, NOW);
  const persisted = { ...legacy, completedAt: first.completedAt!, completedAtEstimated: first.estimated, updatedAt: NOW };
  expect(resolveCropEndDate(persisted)).toEqual({ endDate: LEGACY_UPDATED_AT, estimated: true });
  expect(resolveCropCompletion(persisted, {}, NOW).estimated).toBe(true);
  expect(resolveCropCompletion(persisted, { completedAt: new Date(2026, 5, 19) }, NOW).estimated).toBe(false);
});
