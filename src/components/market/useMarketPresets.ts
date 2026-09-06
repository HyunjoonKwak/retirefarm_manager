"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PresetPayload,
  SavedFilterPreset,
  normalizeStoredPreset,
  toPresetPayload,
} from "./marketPriceTypes";

const DEVICE_KEY = "market_filterPresets";
export type PresetsStatus = "loading" | "ready" | "error" | "unauthenticated";

/**
 * ok: 서버 요청이 성공했는지.
 * applied: 그 결과를 현재 계정 화면에 반영했는지. 계정이 바뀐 뒤 도착한 응답은 false다.
 */
export interface PresetActionResult {
  ok: boolean;
  applied: boolean;
  error?: string;
}

interface AccountPresetsState {
  /** 이 목록이 어느 계정의 것인지. 다른 계정 렌더에서는 노출하지 않는다. */
  ownerKey: string;
  presets: SavedFilterPreset[];
  status: PresetsStatus;
  error: string | null;
  saving: boolean;
}

function readDevicePresets(): SavedFilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DEVICE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row, index) => normalizeStoredPreset(row, `device_${index}`))
      .filter((row): row is SavedFilterPreset => row !== null);
  } catch {
    // 손상된 값 때문에 화면 전체가 죽지 않게 한다.
    return [];
  }
}

/** 저장에 실패하면 false. 호출자는 실패를 성공으로 표시하지 않는다. */
function writeDevicePresets(presets: SavedFilterPreset[]): boolean {
  try {
    window.localStorage.setItem(DEVICE_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

/**
 * 비교 조건 저장소.
 * - 계정 저장은 /api/market/garak/presets만 사용하고 실패를 성공으로 표시하지 않는다.
 * - 조회·저장·삭제 모두 시작 시점의 계정을 기억한다. 계정이 바뀐 뒤 도착한 응답은
 *   새 계정의 목록·status·saving 어느 것도 바꾸지 않는다.
 * - 조회 중에 저장·삭제가 성공하면 진행 중이던 조회를 끊고 다시 조회해 오래된 목록이 덮지 않게 한다.
 * - 기기에 남아 있던 조건은 자동으로 올리지 않고 별도 목록으로 보존한다 (명시적 계정 저장만).
 */
export function useMarketPresets(accountKey: string) {
  const [account, setAccount] = useState<AccountPresetsState>({
    ownerKey: accountKey, presets: [], status: "loading", error: null, saving: false,
  });
  const [devicePresets, setDevicePresets] = useState<SavedFilterPreset[]>([]);

  const ownerRef = useRef(accountKey);
  const epochRef = useRef(0);
  const mountedRef = useRef(false);
  const loadSeqRef = useRef(0);
  const loadRef = useRef<{ seq: number; controller: AbortController } | null>(null);

  const isCurrentOwner = useCallback((owner: string, epoch: number) =>
    mountedRef.current && ownerRef.current === owner && epochRef.current === epoch, []);

  /** 시작 시점 계정이 여전히 현재 계정일 때만 상태를 바꾼다. */
  const applyIfOwner = useCallback((owner: string, updater: (prev: AccountPresetsState) => AccountPresetsState, epoch = epochRef.current) => {
    setAccount((prev) => (mountedRef.current && epochRef.current === epoch && prev.ownerKey === owner && ownerRef.current === owner ? updater(prev) : prev));
  }, []);

  const startLoad = useCallback((owner: string) => {
    loadRef.current?.controller.abort();
    const seq = ++loadSeqRef.current;
    const controller = new AbortController();
    loadRef.current = { seq, controller };
    setAccount({ ownerKey: owner, presets: [], status: "loading", error: null, saving: false });

    void (async () => {
      const isLatest = () => mountedRef.current && !controller.signal.aborted && ownerRef.current === owner && loadSeqRef.current === seq;
      try {
        const response = await fetch("/api/market/garak/presets", { signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!isLatest()) return;
        if (response.status === 401) {
          applyIfOwner(owner, (prev) => ({ ...prev, status: "unauthenticated", presets: [], error: null }));
          return;
        }
        if (!response.ok || !data || !Array.isArray(data.presets)) {
          applyIfOwner(owner, (prev) => ({
            ...prev, status: "error", error: data?.error || "저장된 비교 조건을 불러오지 못했습니다.",
          }));
          return;
        }
        applyIfOwner(owner, (prev) => ({
          ...prev, presets: data.presets as SavedFilterPreset[], status: "ready", error: null,
        }));
      } catch (error) {
        if (controller.signal.aborted || !isLatest()) return;
        applyIfOwner(owner, (prev) => ({
          ...prev, status: "error", error: error instanceof Error ? error.message : "요청 실패",
        }));
      } finally {
        if (loadRef.current?.seq === seq) loadRef.current = null;
      }
    })();
  }, [applyIfOwner]);

  useEffect(() => {
    setDevicePresets(readDevicePresets());
  }, []);

  const invalidateRequests = useCallback(() => {
    mountedRef.current = false; epochRef.current++; loadSeqRef.current++;
    loadRef.current?.controller.abort();
    loadRef.current = null;
  }, []);

  useEffect(() => {
    ownerRef.current = accountKey;
    epochRef.current++; mountedRef.current = true;
    startLoad(accountKey);
    return invalidateRequests;
  }, [accountKey, startLoad, invalidateRequests]);

  const reload = useCallback(() => startLoad(ownerRef.current), [startLoad]);

  /** 조회가 진행 중이면 그 응답이 변경분을 덮으므로 끊고 다시 조회한다. */
  const refreshAfterMutation = useCallback((owner: string) => {
    if (!loadRef.current) return false;
    startLoad(owner);
    return true;
  }, [startLoad]);

  const saveToAccount = useCallback(async (preset: PresetPayload): Promise<PresetActionResult> => {
    const owner = ownerRef.current;
    const epoch = epochRef.current;
    applyIfOwner(owner, (prev) => ({ ...prev, saving: true }), epoch);
    try {
      const response = await fetch("/api/market/garak/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPresetPayload(preset)),
      });
      const data = await response.json().catch(() => null);
      // 계정이 바뀐 뒤 도착한 응답은 새 계정 목록에 넣지 않는다.
      if (!isCurrentOwner(owner, epoch)) return { ok: response.ok, applied: false };
      if (!response.ok || !data?.preset) {
        return { ok: false, applied: false, error: data?.error || "계정에 저장하지 못했습니다." };
      }
      if (!refreshAfterMutation(owner)) {
        applyIfOwner(owner, (prev) => ({
          ...prev, presets: [data.preset as SavedFilterPreset, ...prev.presets], status: "ready", error: null,
        }));
      }
      return { ok: true, applied: true };
    } catch (error) {
      if (!isCurrentOwner(owner, epoch)) return { ok: false, applied: false };
      return { ok: false, applied: false, error: error instanceof Error ? error.message : "요청 실패" };
    } finally {
      applyIfOwner(owner, (prev) => ({ ...prev, saving: false }), epoch);
    }
  }, [applyIfOwner, isCurrentOwner, refreshAfterMutation]);

  const deleteAccountPreset = useCallback(async (id: string): Promise<PresetActionResult> => {
    const owner = ownerRef.current;
    const epoch = epochRef.current;
    try {
      const response = await fetch(`/api/market/garak/presets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!isCurrentOwner(owner, epoch)) return { ok: response.ok, applied: false };
      if (!response.ok || !data?.deleted) {
        return { ok: false, applied: false, error: data?.error || "삭제하지 못했습니다." };
      }
      if (!refreshAfterMutation(owner)) {
        applyIfOwner(owner, (prev) => ({ ...prev, presets: prev.presets.filter((preset) => preset.id !== id) }));
      }
      return { ok: true, applied: true };
    } catch (error) {
      if (!isCurrentOwner(owner, epoch)) return { ok: false, applied: false };
      return { ok: false, applied: false, error: error instanceof Error ? error.message : "요청 실패" };
    }
  }, [applyIfOwner, isCurrentOwner, refreshAfterMutation]);

  /** 기기 목록에서 제거. 저장에 실패하면 목록을 바꾸지 않고 실패를 알린다. */
  const deleteDevicePreset = useCallback((id: string): { ok: boolean; error?: string } => {
    const next = devicePresets.filter((preset) => preset.id !== id);
    if (!writeDevicePresets(next)) {
      return { ok: false, error: "이 기기에 저장된 목록을 수정하지 못했습니다. 브라우저 저장 공간을 확인해 주세요." };
    }
    setDevicePresets(next);
    return { ok: true };
  }, [devicePresets]);

  // 계정이 바뀐 직후 렌더에서는 이전 계정의 목록·상태를 내보내지 않는다.
  const owned = account.ownerKey === accountKey;
  return {
    accountPresets: owned ? account.presets : [],
    status: owned ? account.status : ("loading" as PresetsStatus),
    error: owned ? account.error : null,
    saving: owned ? account.saving : false,
    devicePresets,
    reload,
    saveToAccount,
    deleteAccountPreset,
    deleteDevicePreset,
  };
}

export type MarketPresets = ReturnType<typeof useMarketPresets>;
