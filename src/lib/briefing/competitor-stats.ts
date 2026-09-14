import type { CompetitorEntry, CompetitorGroup, CompetitorObservation } from "./competitor-contracts";
import { qualityLabels, varietyLabels } from "./competitor-contracts";
const WEEK = 7 * 86400000;
const median = (values: number[]) => { const v = [...values].sort((a,b) => a-b); const m = Math.floor(v.length/2); return v.length%2 ? v[m] : (v[m-1]+v[m])/2; };
function latest(entry: CompetitorEntry, at: number): CompetitorObservation|undefined {
  return entry.observations.filter(o => Date.parse(o.observedAt) <= at).sort((a,b) => Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
}
function delivered(o: CompetitorObservation|undefined, at: number): number|null {
  if (!o || Date.parse(o.observedAt) < at-WEEK || o.availability !== "IN_STOCK" || o.price === null || o.price <= 0 || o.shippingFee === null) return null;
  return o.price + o.shippingFee;
}
/** Compare confirmed fixed options only. Stock-outs and unknown shipping never become zero. */
export function summarizeCompetitors(entries: CompetitorEntry[], now = new Date()): CompetitorGroup[] {
  const at = now.getTime();
  const groups = new Map<string, { label: string; packageKg: number; prices: number[]; current: number[]; prior: number[]; stores: Set<string> }>();
  for (const entry of entries) {
    if (entry.archivedAt || entry.varietyGroup === "UNKNOWN") continue;
    const key = [entry.productName, entry.varietyGroup, entry.qualityGroup, entry.packageKg].join("|");
    let group = groups.get(key);
    if (!group) {
      group = { label: `${entry.productName} · ${varietyLabels[entry.varietyGroup as keyof typeof varietyLabels]} · ${qualityLabels[entry.qualityGroup as keyof typeof qualityLabels]} · ${entry.packageKg}kg`, packageKg: entry.packageKg, prices: [], current: [], prior: [], stores: new Set() };
      groups.set(key, group);
    }
    if (group.stores.has(entry.storeKey)) continue;
    group.stores.add(entry.storeKey);
    const current = delivered(latest(entry, at), at);
    if (current === null) continue;
    group.prices.push(current);
    const prior = delivered(latest(entry, at-WEEK), at-WEEK);
    if (prior !== null) { group.current.push(current); group.prior.push(prior); }
  }
  return [...groups].map(([key,g]) => ({ key, label: g.label, packageKg: g.packageKg, count: g.prices.length,
    medianDeliveredPrice: g.prices.length >= 3 ? median(g.prices) : null,
    min: g.prices.length >= 3 ? Math.min(...g.prices) : null, max: g.prices.length >= 3 ? Math.max(...g.prices) : null,
    pairedCount: g.prior.length,
    previousWeekChangePct: g.prior.length >= 3 ? (median(g.current)/median(g.prior)-1)*100 : null,
  }));
}
