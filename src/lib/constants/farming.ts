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

/** FarmActivity.type 표시 라벨 (일지 UI · HWPX 출력 공용) */
export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  SEEDING: "파종",
  TRANSPLANTING: "정식",
  WATERING: "관수",
  FERTILIZING: "시비",
  PEST_CONTROL: "병충해 방제",
  PRUNING: "전정",
  HARVESTING: "수확",
  PACKING: "포장",
  SHIPPING: "출하",
  MAINTENANCE: "시설 관리",
  OTHER: "기타",
};
