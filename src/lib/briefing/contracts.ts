import { z } from "zod";

const id = z.string().min(1).max(100);
const prose = (max: number) => z.string().trim().min(1).max(max)
  .refine(value => !/[0-9０-９]/u.test(value), "수치는 본문 대신 검증된 지표로 표시합니다.");
export const snapshotSchema = z.object({
  schemaVersion: z.literal(1), rulesVersion: z.literal("briefing-v1"),
  statisticsVersion: z.literal("auction-unit-weighted-v1"),
  periodStart: z.iso.datetime(), periodEnd: z.iso.datetime(), generatedAt: z.iso.datetime(),
  sources: z.array(z.object({ id, title: z.string().max(200), url: z.url().nullable(),
    status: z.enum(["AVAILABLE", "NOT_COLLECTED"]), note: z.string().max(1000) }).strict()).max(20),
  metrics: z.array(z.object({ id, label: z.string().max(500), value: z.number().finite(),
    unit: z.string().max(100), sourceId: id }).strict()).max(1000),
  limitations: z.array(z.string().max(1000)).max(20),
}).strict();
export type BriefingSnapshot = z.infer<typeof snapshotSchema>;
export const resultSchema = z.object({
  schemaVersion: z.literal(1), summary: prose(500),
  sections: z.array(z.object({
    key: z.enum(["market", "cultivation", "commerce", "competitors"]), body: prose(3000),
    sourceIds: z.array(id).max(20), metricIds: z.array(id).max(100),
  }).strict()).length(4).refine(rows => new Set(rows.map(row => row.key)).size === 4),
  actions: z.array(z.object({ text: prose(500), sourceIds: z.array(id).max(20) }).strict()).length(3),
  limitations: z.array(prose(500)).max(20),
}).strict();
export type BriefingResult = z.infer<typeof resultSchema>;
const lease = { jobId: id, leaseToken: z.string().uuid() };
export const workerRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }).strict(),
  z.object({ action: z.literal("heartbeat"), ...lease }).strict(),
  z.object({ action: z.literal("complete"), ...lease, inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    result: resultSchema, usage: z.object({ inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(), cachedInputTokens: z.number().int().nonnegative() }).strict().optional(),
  }).strict(),
  z.object({ action: z.literal("fail"), ...lease,
    code: z.enum(["AUTH_REQUIRED", "RATE_LIMIT", "CODEX_FAILED", "INVALID_OUTPUT", "TIMEOUT"]),
  }).strict(),
]);
export function validateReferences(result: BriefingResult, snapshot: BriefingSnapshot) {
  const sources = new Set(snapshot.sources.map(source => source.id));
  const metrics = new Set(snapshot.metrics.map(metric => metric.id));
  return result.sections.every(section => section.sourceIds.every(id => sources.has(id)) && section.metricIds.every(id => metrics.has(id)))
    && result.actions.every(action => action.sourceIds.every(id => sources.has(id)));
}

/** Reject oversized streaming bodies as well as forged/missing Content-Length. */
export async function boundedJson(request: Request, limit = 256 * 1024): Promise<unknown> {
  if (!request.body) throw new Error("INVALID_REQUEST");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("INVALID_REQUEST"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}
