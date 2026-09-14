import { z } from "zod";
import { DISCOVERY_SEARCH_HOST, normalizeDiscoveryQuery } from "./discovery-contracts";
/**
 * Client-safe contracts for user-driven competitor search collection jobs. A job is a bookkeeping record the user
 * advances by hand (start, block, resume, cancel); nothing here schedules, times out or claims a browser is running.
 * A job succeeds only when the discovery import that references it saves the reviewed evidence (see discovery.ts).
 */
export const collectionJobStatuses = ["PENDING", "RUNNING", "BLOCKED", "SUCCEEDED", "CANCELLED"] as const;
export type CollectionJobStatus = (typeof collectionJobStatuses)[number];
/** Statuses that hold one of the per-user active slots. SUCCEEDED and CANCELLED release the slot. */
export const collectionActiveStatuses = ["PENDING", "RUNNING", "BLOCKED"] as const;
export const collectionBlockReasons = ["SECURITY_CHECK", "LOGIN_REQUIRED", "PAGE_CHANGED", "NETWORK_ERROR", "BROWSER_UNAVAILABLE"] as const;
export type CollectionBlockReason = (typeof collectionBlockReasons)[number];
export const collectionStatusLabels: Record<CollectionJobStatus, string> = {
  PENDING: "대기", RUNNING: "수집 중", BLOCKED: "중단됨", SUCCEEDED: "저장 완료", CANCELLED: "취소됨",
};
export const collectionBlockReasonLabels: Record<CollectionBlockReason, string> = {
  SECURITY_CHECK: "보안 확인 요구", LOGIN_REQUIRED: "로그인 필요", PAGE_CHANGED: "페이지 구조 변경",
  NETWORK_ERROR: "네트워크 오류", BROWSER_UNAVAILABLE: "브라우저 사용 불가",
};

export const COLLECTION_MAX_QUERIES = 3;
export const COLLECTION_QUERY_MAX_LENGTH = 100;
/** PENDING + RUNNING + BLOCKED jobs a user may hold at once. */
export const COLLECTION_MAX_ACTIVE = 9;
/** Jobs a user may create in a rolling 24-hour window. */
export const COLLECTION_MAX_DAILY = 30;
/** Latest finished jobs listed in the overview; active jobs are always included on top of this. */
export const COLLECTION_OVERVIEW_LIMIT = 60;
/** Evidence saved against a job must have been observed within this window before the import. */
export const COLLECTION_EVIDENCE_WINDOW_MS = 24 * 3_600_000;
export const COLLECTION_QUERY_MESSAGE = "검색어는 1~3개, 각 100자 이내로 입력해 주세요.";

/** Canonical Naver+ search page (/ns/search — the only layout the capture extension supports) for a normalised query. */
export const buildCollectionSearchUrl = (query: string) =>
  `https://${DISCOVERY_SEARCH_HOST}/ns/search?${new URLSearchParams({ query: normalizeDiscoveryQuery(query) }).toString()}`;

/** Trim, collapse whitespace, fold case, then drop repeats while keeping first-seen order. */
export function normalizeCollectionQueries(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map(normalizeDiscoveryQuery).filter(query => {
    if (query.length === 0 || seen.has(query)) return false;
    seen.add(query);
    return true;
  });
}

const jobRef = { jobId: z.string().trim().min(1).max(100), version: z.number().int().min(1).max(1_000_000_000) };
// Raw arrays longer than the cap are passed through untouched so `.max` rejects them before any normalisation work.
const queries = z.preprocess(
  value => Array.isArray(value) && value.length <= COLLECTION_MAX_QUERIES && value.every(item => typeof item === "string") ? normalizeCollectionQueries(value) : value,
  z.array(z.string().min(1).max(COLLECTION_QUERY_MAX_LENGTH)).min(1, COLLECTION_QUERY_MESSAGE).max(COLLECTION_MAX_QUERIES, COLLECTION_QUERY_MESSAGE),
);
export const collectionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), queries }).strict(),
  z.object({ action: z.literal("start"), ...jobRef }).strict(),
  z.object({ action: z.literal("resume"), ...jobRef }).strict(),
  z.object({ action: z.literal("cancel"), ...jobRef }).strict(),
  z.object({ action: z.literal("block"), ...jobRef, reason: z.enum(collectionBlockReasons) }).strict(),
]);
export type CollectionRequest = z.infer<typeof collectionRequestSchema>;

export interface CollectionJob {
  id: string;
  /** Normalised query; evidence imported against this job must carry the same query. */
  query: string;
  searchUrl: string;
  status: CollectionJobStatus;
  /** Block reason (one of collectionBlockReasons) while BLOCKED; cleared on resume. */
  reason: string | null;
  createdAt: string;
  /** Last user start/resume signal; evidence must be observed at or after this instant. */
  startedAt: string | null;
  completedAt: string | null;
  /** Reviewed evidence rows saved by the completing import; 0 until SUCCEEDED. */
  evidenceCount: number;
  /** Discovery run that completed the job. */
  runId: string | null;
  /** Optimistic-concurrency token; every mutation that changes state increments it. */
  version: number;
}
export interface CollectionOverview {
  jobs: CollectionJob[];
  /** completedAt of the current user's newest SUCCEEDED job over their whole history, or null when none has succeeded yet. */
  lastSuccessAt: string | null;
}
