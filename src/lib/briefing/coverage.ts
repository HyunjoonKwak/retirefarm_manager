import { z } from "zod";
import { marketDateKey, marketDayStart } from "@/lib/market-date";

/**
 * Collection-log coverage for a weekly pricing snapshot.
 *
 * A slot is one KST calendar day in the half-open [start, end) range times one distinct corporation.
 * Only DataCollectionLog rows decide a slot's status: raw trades never imply coverage,
 * Sunday/holiday closure is never inferred, and error messages are never exposed.
 */
export type CoverageStatus = "SUCCESS" | "EMPTY" | "PARTIAL" | "FAILED" | "UNKNOWN";
export type CoverageIssueStatus = Exclude<CoverageStatus, "SUCCESS" | "EMPTY">;

export interface CoverageLog {
  id: string;
  /** Collector stores the collected day as a timestamp; the day is resolved in KST (server TZ in production). */
  targetDate: Date;
  corporation: string;
  /** Comma-separated product scope; null or blank means every product. */
  targetProducts: string | null;
  status: string;
  startedAt: Date;
  /** null means the run never recorded completion (in progress or crashed). */
  completedAt: Date | null;
}

export interface CoverageIssue {
  date: string;
  corporationCode: string;
  status: CoverageIssueStatus;
}

export interface CoverageSummary {
  periodStart: string;
  periodEnd: string;
  totalSlots: number;
  /** SUCCESS + EMPTY slots. */
  verifiedSlots: number;
  /** Subset of verifiedSlots whose latest log reported zero trades. */
  emptySlots: number;
  partialSlots: number;
  failedSlots: number;
  unknownSlots: number;
  issues: CoverageIssue[];
}

const MAX_DAYS = 366;
const DAY_MS = 86400_000;
const dateSchema = z.date().refine((d) => !Number.isNaN(d.getTime()), "invalid date");
const logSchema = z.object({
  id: z.string(),
  targetDate: dateSchema,
  corporation: z.string(),
  targetProducts: z.string().nullable(),
  status: z.string(),
  startedAt: dateSchema,
  completedAt: dateSchema.nullable(),
});
const inputSchema = z
  .object({
    start: dateSchema,
    end: dateSchema,
    corporations: z.array(z.string()),
    productName: z.string().trim().min(1),
    logs: z.array(logSchema),
    now: dateSchema,
  })
  .refine((v) => v.start.getTime() < v.end.getTime(), "start must be before end");

export type CoverageInput = z.input<typeof inputSchema>;

/** Higher is worse; used only to break exact-time ties conservatively. */
const SEVERITY: Record<CoverageStatus, number> = { UNKNOWN: 4, FAILED: 3, PARTIAL: 2, EMPTY: 1, SUCCESS: 0 };
const KNOWN_STATUSES: ReadonlySet<string> = new Set(["SUCCESS", "EMPTY", "PARTIAL", "FAILED"]);

function normalizeStatus(log: CoverageLog): CoverageStatus {
  if (log.completedAt === null) return "UNKNOWN";
  return KNOWN_STATUSES.has(log.status) ? (log.status as CoverageStatus) : "UNKNOWN";
}

function coversProduct(log: CoverageLog, productName: string): boolean {
  const tokens = (log.targetProducts ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return tokens.length === 0 || tokens.includes(productName);
}

function isFuture(log: CoverageLog, now: Date): boolean {
  const limit = now.getTime();
  return log.startedAt.getTime() > limit || (log.completedAt !== null && log.completedAt.getTime() > limit);
}

/** Ordering time: completion when known, otherwise start. */
function effectiveTime(log: CoverageLog): number {
  return (log.completedAt ?? log.startedAt).getTime();
}

/**
 * Negative when `a` should win as the latest log.
 * Later completion wins, then later start; on an exact tie the worse status wins (conservative),
 * and id is the final deterministic tie-break.
 */
function compareLatest(a: CoverageLog, b: CoverageLog): number {
  return (
    effectiveTime(b) - effectiveTime(a) ||
    b.startedAt.getTime() - a.startedAt.getTime() ||
    SEVERITY[normalizeStatus(b)] - SEVERITY[normalizeStatus(a)] ||
    b.id.localeCompare(a.id)
  );
}

function listDays(start: Date, end: Date): string[] {
  const first = marketDayStart(marketDateKey(start)).getTime();
  const count = Math.ceil((end.getTime() - first) / DAY_MS);
  if (count > MAX_DAYS) throw new Error(`coverage range exceeds ${MAX_DAYS} days`);
  return Array.from({ length: count }, (_, i) => marketDateKey(new Date(first + i * DAY_MS)));
}

function dedupeCorporations(codes: string[]): string[] {
  return [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
}

function slotKey(date: string, corporation: string): string {
  return `${date}|${corporation}`;
}

function pickLatestPerSlot(
  logs: CoverageLog[],
  days: ReadonlySet<string>,
  corps: ReadonlySet<string>,
  productName: string,
  now: Date,
): ReadonlyMap<string, CoverageLog> {
  const applicable = logs.filter(
    (log) =>
      !isFuture(log, now) &&
      corps.has(log.corporation) &&
      days.has(marketDateKey(log.targetDate)) &&
      coversProduct(log, productName),
  );
  return applicable.reduce<ReadonlyMap<string, CoverageLog>>((acc, log) => {
    const key = slotKey(marketDateKey(log.targetDate), log.corporation);
    const current = acc.get(key);
    if (current && compareLatest(current, log) <= 0) return acc;
    return new Map([...acc, [key, log]]);
  }, new Map());
}

export function summarizeCoverage(rawInput: CoverageInput): CoverageSummary {
  const input = inputSchema.parse(rawInput);
  const days = listDays(input.start, input.end);
  const corporations = dedupeCorporations(input.corporations);
  const latest = pickLatestPerSlot(input.logs, new Set(days), new Set(corporations), input.productName, input.now);

  const slots = days.flatMap((date) =>
    corporations.map((corporationCode) => {
      const log = latest.get(slotKey(date, corporationCode));
      const status: CoverageStatus = log ? normalizeStatus(log) : "UNKNOWN";
      return { date, corporationCode, status };
    }),
  );
  const count = (pred: (s: CoverageStatus) => boolean) => slots.filter((s) => pred(s.status)).length;
  const issues = slots.flatMap((s) =>
    s.status === "SUCCESS" || s.status === "EMPTY" ? [] : [{ date: s.date, corporationCode: s.corporationCode, status: s.status }],
  );

  return {
    periodStart: input.start.toISOString(),
    periodEnd: input.end.toISOString(),
    totalSlots: slots.length,
    verifiedSlots: count((s) => s === "SUCCESS" || s === "EMPTY"),
    emptySlots: count((s) => s === "EMPTY"),
    partialSlots: count((s) => s === "PARTIAL"),
    failedSlots: count((s) => s === "FAILED"),
    unknownSlots: count((s) => s === "UNKNOWN"),
    issues,
  };
}
