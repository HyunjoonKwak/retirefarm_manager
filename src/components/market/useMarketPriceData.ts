"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DailyDetailResult,
  EMPTY_FACETS_STATE,
  NoAuctionDates,
  PriceHistory,
  VarietyFacetsState,
  WatchlistItem,
  buildAnalysisUrl,
  buildDailyDetailUrl,
  buildFacetsQueryKey,
  buildFacetsUrl,
  buildHistoryUrl,
  createLatestRequestGuard,
  facetsStateFromResponse,
  marketQueryString,
} from "./marketPriceTypes";

export interface MarketDataParams {
  /** 로그인 계정 식별자. 바뀌면 이전 계정의 요청과 결과를 버린다. */
  accountKey: string;
  selectedProduct: string | null;
  selectedVarieties: string[];
  selectedOrigin: string | null;
  selectedUnit: string | null;
  selectedGrade: string | null;
  viewDays: string;
  selectedDate: string;
}

/**
 * 시세 화면의 서버 조회를 한곳에서 관리한다.
 * - 모든 조회는 최신 요청 가드를 거쳐 늦게 도착한 응답을 버린다.
 * - 선택하지 않은 조건은 요청에 넣지 않는다 (URL 빌더가 처리).
 * - 계정이 바뀌면 진행 중 요청을 끊고 이전 결과를 지운다.
 */
export function useMarketPriceData(params: MarketDataParams) {
  const {
    accountKey, selectedProduct, selectedVarieties, selectedOrigin,
    selectedUnit, selectedGrade, viewDays, selectedDate,
  } = params;

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [varieties, setVarieties] = useState<string[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [noAuctionDates, setNoAuctionDates] = useState<NoAuctionDates>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [dailyResults, setDailyResults] = useState<DailyDetailResult[]>([]);
  const [facetsState, setFacetsState] = useState<VarietyFacetsState>(EMPTY_FACETS_STATE);
  const [loading, setLoading] = useState(true);
  const [loadedAccount, setLoadedAccount] = useState(accountKey);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);

  const latestGuard = useRef(createLatestRequestGuard());
  const facetsGuard = useRef(createLatestRequestGuard());
  const listsGuard = useRef(createLatestRequestGuard());
  const historyGuard = useRef(createLatestRequestGuard());
  const dailyGuard = useRef(createLatestRequestGuard());
  const watchlistGuard = useRef(createLatestRequestGuard());

  const fetchWatchlist = useCallback(async () => {
    const signal = watchlistGuard.current.start(accountKey);
    try {
      const response = await fetch("/api/market/garak/watchlist", { signal });
      const data = await response.json();
      if (!watchlistGuard.current.isLatest(accountKey, signal)) return;
      setWatchlist(data.watchlist || []);
    } catch {
      if (!watchlistGuard.current.isLatest(accountKey, signal)) return;
      setWatchlist([]);
    }
  }, [accountKey]);

  const fetchLatestDate = useCallback(async () => {
    const signal = latestGuard.current.start("latest");
    try {
      const response = await fetch("/api/market/garak?action=latest", { signal });
      const data = await response.json();
      if (!latestGuard.current.isLatest("latest", signal)) return;
      setLatestDate(response.ok ? data.latestDate ?? null : null);
    } catch {
      if (latestGuard.current.isLatest("latest", signal)) setLatestDate(null);
    }
  }, []);

  const fetchLists = useCallback(async (productName: string) => {
    const signal = listsGuard.current.start(productName);
    setVarieties([]); setOrigins([]);
    try {
      const [varietiesRes, originsRes] = await Promise.all([
        fetch(`/api/market/garak?${marketQueryString({ action: "varieties", productName })}`, { signal }),
        fetch(`/api/market/garak?${marketQueryString({ action: "origins", productName })}`, { signal }),
      ]);
      const [varietiesData, originsData] = await Promise.all([varietiesRes.json(), originsRes.json()]);
      if (!listsGuard.current.isLatest(productName, signal)) return;
      if (!varietiesRes.ok || !originsRes.ok) throw new Error("목록 조회 실패");
      setVarieties(varietiesData.varieties || []);
      setOrigins(originsData.origins || []);
    } catch {
      if (!listsGuard.current.isLatest(productName, signal)) return;
      setVarieties([]);
      setOrigins([]);
    }
  }, []);

  const fetchFacets = useCallback(
    async (productName: string, origin: string | null, unit: string | null, grade: string | null, days: string) => {
      const key = buildFacetsQueryKey(productName, origin, unit, grade, days);
      const signal = facetsGuard.current.start(key);
      setFacetsState({ ...EMPTY_FACETS_STATE, status: "loading", queryKey: key });
      try {
        const response = await fetch(buildFacetsUrl(productName, origin, unit, grade, days), { signal });
        const data = await response.json().catch(() => null);
        if (!facetsGuard.current.isLatest(key, signal)) return;
        setFacetsState(facetsStateFromResponse(key, response.ok, response.status, data));
      } catch (error) {
        if (signal.aborted || !facetsGuard.current.isLatest(key, signal)) return;
        setFacetsState({
          ...EMPTY_FACETS_STATE, status: "error", queryKey: key,
          error: error instanceof Error ? error.message : "요청 실패",
        });
      }
    },
    []
  );

  const fetchPriceHistory = useCallback(
    async (
      productName: string, varietyNames: string[], origin: string | null,
      unit: string | null, grade: string | null, days: string
    ) => {
      const url = buildHistoryUrl(productName, days, { varieties: varietyNames, origin, unit, grade });
      const signal = historyGuard.current.start(url);
      setLoadingHistory(true);
      setHistoryError(null);
      setPriceHistory([]); setNoAuctionDates([]);
      try {
        const response = await fetch(url, { signal });
        const data = await response.json();
        if (!historyGuard.current.isLatest(url, signal)) return;
        if (!response.ok) throw new Error("가격 추이를 조회하지 못했습니다.");
        setPriceHistory(data.history || []);
        setNoAuctionDates(data.noAuctionDates || []);
      } catch {
        if (!historyGuard.current.isLatest(url, signal)) return;
        setPriceHistory([]);
        setNoAuctionDates([]);
        setHistoryError("가격 추이 조회에 실패했습니다. 새로고침해 주세요.");
      } finally {
        // 늦은 응답이 새 요청의 로딩 표시를 끄지 않게 한다
        if (historyGuard.current.isLatest(url, signal)) setLoadingHistory(false);
      }
    },
    []
  );

  const fetchDailyDetail = useCallback(
    async (
      date: string, productName: string, varietyNames: string[],
      origin: string | null, unit: string | null, grade: string | null
    ) => {
      const url = buildDailyDetailUrl(date, productName, { varieties: varietyNames, origin, unit, grade });
      const signal = dailyGuard.current.start(url);
      setLoadingDaily(true);
      setDailyError(null);
      setDailyResults([]);
      try {
        const response = await fetch(url, { signal });
        const data = await response.json();
        if (!dailyGuard.current.isLatest(url, signal)) return;
        if (!response.ok) throw new Error("상세 거래를 조회하지 못했습니다.");
        setDailyResults(data.results || []);
      } catch {
        if (!dailyGuard.current.isLatest(url, signal)) return;
        setDailyResults([]);
        setDailyError("상세 거래 조회에 실패했습니다. 날짜를 다시 선택해 주세요.");
      } finally {
        if (dailyGuard.current.isLatest(url, signal)) setLoadingDaily(false);
      }
    },
    []
  );

  const cancelAll = useCallback(() => {
    [latestGuard, facetsGuard, listsGuard, historyGuard, dailyGuard, watchlistGuard].forEach((ref) => ref.current.cancel());
  }, []);

  // 계정이 바뀌면 이전 계정의 응답과 결과를 남기지 않는다.
  useEffect(() => {
    cancelAll();
    setLoadedAccount(accountKey);
    setHistoryError(null); setDailyError(null);
    setWatchlist([]); setVarieties([]); setOrigins([]);
    setPriceHistory([]); setNoAuctionDates([]); setDailyResults([]);
    setFacetsState(EMPTY_FACETS_STATE);
  }, [accountKey, cancelAll]);

  useEffect(() => {
    setLoading(true);
    let current = true;
    Promise.all([fetchWatchlist(), fetchLatestDate()]).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [fetchWatchlist, fetchLatestDate]);

  useEffect(() => {
    if (!selectedProduct) {
      listsGuard.current.cancel();
      setVarieties([]); setOrigins([]);
      return;
    }
    fetchLists(selectedProduct);
  }, [accountKey, selectedProduct, fetchLists]);

  // 품종 선택은 facets 의존성에 넣지 않는다 (A를 골라도 B 후보가 숨지 않게)
  useEffect(() => {
    if (!selectedProduct) {
      facetsGuard.current.cancel();
      setFacetsState(EMPTY_FACETS_STATE);
      return;
    }
    fetchFacets(selectedProduct, selectedOrigin, selectedUnit, selectedGrade, viewDays);
  }, [accountKey, selectedProduct, selectedOrigin, selectedUnit, selectedGrade, viewDays, fetchFacets]);

  useEffect(() => {
    if (!selectedProduct) {
      historyGuard.current.cancel(); setPriceHistory([]); setNoAuctionDates([]);
      setHistoryError(null); setLoadingHistory(false); return;
    }
    fetchPriceHistory(selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, viewDays);
  }, [accountKey, selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, viewDays, fetchPriceHistory]);

  useEffect(() => {
    if (!selectedDate || !selectedProduct) {
      dailyGuard.current.cancel();
      setDailyError(null); setLoadingDaily(false);
      setDailyResults([]);
      return;
    }
    fetchDailyDetail(selectedDate, selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade);
  }, [accountKey, selectedDate, selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, fetchDailyDetail]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      fetchLatestDate();
      if (selectedProduct) {
        fetchPriceHistory(selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, viewDays);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchLatestDate, fetchPriceHistory, selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, viewDays]);

  useEffect(() => cancelAll, [cancelAll]);

  const refresh = useCallback(() => {
    fetchWatchlist();
    fetchLatestDate();
    if (selectedProduct) {
      fetchPriceHistory(selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, viewDays);
    }
  }, [fetchWatchlist, fetchLatestDate, fetchPriceHistory, selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, viewDays]);

  const analysisUrl = selectedProduct
    ? buildAnalysisUrl(selectedProduct, viewDays, {
        varieties: selectedVarieties, origin: selectedOrigin, unit: selectedUnit, grade: selectedGrade,
      })
    : null;

  return {
    watchlist, varieties, origins, priceHistory, noAuctionDates, latestDate, dailyResults,
    facetsState, loading: loading || loadedAccount !== accountKey, loadingHistory, loadingDaily, analysisUrl,
    historyError, dailyError,
    refresh, refreshWatchlist: fetchWatchlist,
  };
}
