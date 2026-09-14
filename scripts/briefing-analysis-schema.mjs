// Shared by the Next server and standalone Mac worker; older snapshots omit analysis.
import { z } from 'zod';
const count = z.number().int().nonnegative();
const coverage = z.object({
  periodStart: z.iso.datetime(), periodEnd: z.iso.datetime(), totalSlots: count, verifiedSlots: count,
  emptySlots: count, partialSlots: count, failedSlots: count, unknownSlots: count,
  issues: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), corporationCode: z.string().max(50),
    status: z.enum(['PARTIAL', 'FAILED', 'UNKNOWN']) }).strict()).max(400),
}).strict();
const comparison = z.object({
  price: z.number().positive().finite().nullable(), tradeCount: count, observedDays: count,
  changePct: z.number().finite().nullable(),
  status: z.enum(['COMPARABLE', 'NO_BASELINE', 'LOW_SAMPLE', 'UNVERIFIED_COLLECTION']),
}).strict();
export const analysisSchema = z.object({
  version: z.literal(1),
  coverage: z.object({ current: coverage, previous: coverage, fourWeeks: coverage }).strict(),
  comparisons: z.array(z.object({ metricId: z.string().min(1).max(100), currentDays: count, currentTrades: count,
    previous: comparison, fourWeeks: comparison }).strict()).max(200),
}).strict();
