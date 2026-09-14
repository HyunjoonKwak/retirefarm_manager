"use client";

import { useEffect, useState } from "react";
import type { BriefingFacets } from "@/lib/briefing/facets";

const DEBOUNCE_MS = 300;
const facetKey = (productName: string, origin: string) => JSON.stringify([productName.trim(), origin]);
type State = { key: string; product: string; facets: BriefingFacets | null; error: string; loading: boolean };

/**
 * Loads observed origins/varieties for the trimmed product; responses for superseded inputs are discarded.
 * While only the origin changes, the previous response for the same product stays visible with `loading`
 * so the origin list and current choice do not vanish; `settled` is true only for the exact current inputs.
 */
export function useBriefingFacets(productName: string, origin: string) {
  const product = productName.trim();
  const key = facetKey(productName, origin);
  const [state, setState] = useState<State>({ key, product, facets: null, error: "", loading: false });
  useEffect(() => {
    if (!product) { setState({ key, product, facets: null, error: "", loading: false }); return; }
    setState(current => ({ key, product, facets: current.product === product ? current.facets : null, error: "", loading: true }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ productName: product, ...(origin ? { origin } : {}) });
        const response = await fetch(`/api/briefings/facets?${params}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body.error);
        if (!Array.isArray(body?.origins) || !Array.isArray(body?.varieties)) throw new Error("");
        setState({ key, product, facets: body, error: "", loading: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ key, product, facets: null, error: error instanceof Error && error.message ? error.message : "선택 가능한 산지·품종을 불러오지 못했습니다.", loading: false });
      }
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [product, origin, key]);
  // A response is only trusted for the inputs it was requested with; same-product data may be shown while loading.
  const settled = state.key === key && !state.loading;
  const sameProduct = state.product === product;
  return { facets: sameProduct ? state.facets : null, error: settled ? state.error : "", loading: !settled, settled };
}
