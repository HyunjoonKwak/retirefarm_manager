/**
 * 농장 프로필 공용 상수 (온보딩 마법사 · FarmProfile)
 */

export const FARMING_TYPES = [
  "OPEN_FIELD",
  "GREENHOUSE",
  "SMART_FARM",
  "ORCHARD",
  "MIXED",
] as const;

export type FarmingType = (typeof FARMING_TYPES)[number];

export const FARMING_TYPE_LABELS: Record<FarmingType, string> = {
  OPEN_FIELD: "노지 재배",
  GREENHOUSE: "시설(하우스) 재배",
  SMART_FARM: "스마트팜",
  ORCHARD: "과수원",
  MIXED: "복합 영농",
};
