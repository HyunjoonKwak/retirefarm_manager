import type { CompetitorEntry, CompetitorGroup, CompetitorObservation } from "./competitor-contracts";
import { qualityLabels, sizeLabels, varietyLabels } from "./competitor-contracts";
const WEEK = 7 * 86400000;
const median = (values: number[]) => { const v = [...values].sort((a,b) => a-b); const m = Math.floor(v.length/2); return v.length%2 ? v[m] : (v[m-1]+v[m])/2; };
function latest(entry: CompetitorEntry, at: number): CompetitorObservation|undefined {
  return entry.observations.filter(o => Date.parse(o.observedAt) <= at).sort((a,b) => Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
}
function delivered(o: CompetitorObservation|undefined, at: number): number|null {
  if (!o || Date.parse(o.observedAt) < at-WEEK || o.availability !== "IN_STOCK" || o.price === null || o.price <= 0 || o.shippingFee === null) return null;
  return o.price + o.shippingFee;
}
/** Only a confirmed grade with a confirmed boundary is comparable; rows from before the size columns existed are absent/UNKNOWN. */
function sizeOf(entry: CompetitorEntry): { grade: keyof typeof sizeLabels; criteria: string }|null {
  const grade = entry.sizeGrade ?? "UNKNOWN";
  const criteria = (entry.sizeCriteria ?? "").trim();
  if (grade === "UNKNOWN" || !Object.hasOwn(sizeLabels, grade) || !criteria) return null;
  return { grade: grade as keyof typeof sizeLabels, criteria };
}
/** Compare confirmed fixed options only. Stock-outs and unknown shipping never become zero. */
export function summarizeCompetitors(entries: CompetitorEntry[], now = new Date()): CompetitorGroup[] {
  const at = now.getTime();
  const groups = new Map<string, { label: string; packageKg: number; sizeGrade: string; sizeCriteria: string; prices: number[]; current: number[]; prior: number[]; stores: Set<string> }>();
  for (const entry of entries) {
    if (entry.archivedAt || entry.varietyGroup === "UNKNOWN") continue;
    const size = sizeOf(entry);
    if (!size) continue;
    const key = JSON.stringify([entry.productName, entry.varietyGroup, entry.qualityGroup, entry.packageKg, size.grade, size.criteria]);
    let group = groups.get(key);
    if (!group) {
      group = { label: `${entry.productName} · ${varietyLabels[entry.varietyGroup as keyof typeof varietyLabels]} · ${qualityLabels[entry.qualityGroup as keyof typeof qualityLabels]} · ${entry.packageKg}kg · ${sizeLabels[size.grade]} (${size.criteria})`,
        packageKg: entry.packageKg, sizeGrade: size.grade, sizeCriteria: size.criteria, prices: [], current: [], prior: [], stores: new Set() };
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
  return [...groups].map(([key,g]) => ({ key, label: g.label, packageKg: g.packageKg, sizeGrade: g.sizeGrade, sizeCriteria: g.sizeCriteria, count: g.prices.length,
    medianDeliveredPrice: g.prices.length >= 3 ? median(g.prices) : null,
    min: g.prices.length >= 3 ? Math.min(...g.prices) : null, max: g.prices.length >= 3 ? Math.max(...g.prices) : null,
    pairedCount: g.prior.length,
    previousWeekChangePct: g.prior.length >= 3 ? (median(g.current)/median(g.prior)-1)*100 : null,
  }));
}
