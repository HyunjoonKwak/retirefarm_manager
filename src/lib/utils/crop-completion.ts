/**
 * 작물 완료 시점(completedAt) 결정 규칙 (리뷰 A4).
 *
 * - COMPLETED/FAILED로 처음 전이될 때 서버가 now를 기록한다. 요청에 completedAt이 있으면 그 값.
 * - GROWING/HARVESTING으로 되돌리면 null로 지운다.
 * - 레거시 행(이미 종료 상태인데 completedAt이 null)은 어떤 편집이든 처음 들어올 때
 *   편집 전 updatedAt을 completedAt으로 고정한다. 이 값은 "마지막 수정 시각" 기반 추정치이며
 *   보고서에서 completedAtEstimated로 표시하고 사용자가 교정할 수 있다.
 *   (마이그레이션에서 일괄 backfill하지 않는 이유: 과거 이력을 임의로 추정하지 않기 위해)
 */
export const TERMINAL_CROP_STATUSES = ["COMPLETED", "FAILED"] as const;

export function isTerminalCropStatus(status: string): boolean {
  return (TERMINAL_CROP_STATUSES as readonly string[]).includes(status);
}

export interface CropCompletionState {
  status: string;
  completedAt: Date | null;
  completedAtEstimated?: boolean;
  /** 편집 전 updatedAt */
  updatedAt: Date;
}

export interface CropCompletionPatch {
  status?: string;
  /** undefined = 요청에 없음, null = 명시적으로 지움 */
  completedAt?: Date | null;
}

export interface CropCompletionResolution {
  /** undefined = 변경 없음 */
  completedAt: Date | null | undefined;
  /** 편집 전 updatedAt으로 고정한 경우 true */
  estimated: boolean;
}

export function resolveCropCompletion(
  existing: CropCompletionState,
  patch: CropCompletionPatch,
  now: Date = new Date()
): CropCompletionResolution {
  const nextStatus = patch.status ?? existing.status;

  if (!isTerminalCropStatus(nextStatus)) {
    return { completedAt: existing.completedAt === null ? undefined : null, estimated: false };
  }

  if (patch.completedAt !== undefined && patch.completedAt !== null) {
    return { completedAt: patch.completedAt, estimated: false };
  }

  if (!isTerminalCropStatus(existing.status)) {
    return { completedAt: now, estimated: false };
  }

  if (existing.completedAt === null) {
    return { completedAt: existing.updatedAt, estimated: true };
  }

  return { completedAt: undefined, estimated: Boolean(existing.completedAtEstimated) };
}

/** 보고서용: completedAt이 없으면 updatedAt으로 폴백하고 추정 여부를 함께 돌려준다. */
export function resolveCropEndDate(
  crop: { status: string; completedAt: Date | null; completedAtEstimated?: boolean; updatedAt: Date },
  now: Date = new Date()
): { endDate: Date; estimated: boolean } {
  if (!isTerminalCropStatus(crop.status)) {
    return { endDate: now, estimated: false };
  }
  if (crop.completedAt) {
    return { endDate: crop.completedAt, estimated: Boolean(crop.completedAtEstimated) };
  }
  return { endDate: crop.updatedAt, estimated: true };
}
