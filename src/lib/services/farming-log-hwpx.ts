/**
 * 영농일지 HWPX 생성 (Asset Hub §6 — 농정 관청 제출용, hwpxcore MIT)
 *
 * Skeleton.hwpx 템플릿에 제목·농장 정보·월별 작업 내역 표를 주입한다.
 * 표 행 구성은 순수 함수(buildFarmingLogRows)로 분리해 테스트한다.
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { HwpxDocument } from "@ubermensch1218/hwpxcore";
import { blockNoteToPlainText } from "@/lib/utils/blocknote";
import {
  ACTIVITY_TYPE_LABELS,
  FARMING_TYPE_LABELS,
  type FarmingType,
} from "@/lib/constants/farming";

export interface HwpxLogActivity {
  type: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  crop?: { name: string } | null;
}

export interface HwpxLog {
  date: Date;
  weather: string | null;
  temperature: number | null;
  notes: string | null;
  content: string | null;
  activities: HwpxLogActivity[];
}

export interface HwpxFarmInfo {
  userName: string;
  region?: string | null;
  farmingType?: string | null;
  areaPyeong?: number | null;
}

export const LOG_TABLE_HEADER = ["일자", "날씨", "기온(℃)", "작업 구분", "작업 내용"];

function formatDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function describeActivity(activity: HwpxLogActivity): string {
  const cropPrefix = activity.crop?.name ? `[${activity.crop.name}] ` : "";
  const quantity =
    activity.quantity !== null
      ? ` (${activity.quantity}${activity.unit ?? ""})`
      : "";
  return `${cropPrefix}${activity.description}${quantity}`;
}

/**
 * 일지 목록 → 표 행(헤더 제외). 활동 1건 = 1행, 자유 서술 본문은 "기록" 행.
 * 활동·본문이 모두 없으면 한 줄 요약(notes)으로 1행을 만든다.
 */
export function buildFarmingLogRows(logs: HwpxLog[]): string[][] {
  return logs.flatMap((log) => {
    const day = formatDay(log.date);
    const weather = log.weather ?? "";
    const temperature = log.temperature !== null ? String(log.temperature) : "";
    const rows: string[][] = log.activities.map((activity) => [
      day,
      weather,
      temperature,
      ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type,
      describeActivity(activity),
    ]);

    const bodyText = blockNoteToPlainText(log.content, 2000);
    if (bodyText) {
      rows.push([day, weather, temperature, "기록", bodyText]);
    }

    if (rows.length === 0) {
      rows.push([day, weather, temperature, "기록", log.notes ?? ""]);
    }

    return rows;
  });
}

/**
 * 패키지 자산(assets/Skeleton.hwpx)을 런타임 fs로 읽는다.
 * 번들에 인라인되면 경로가 깨지므로 next.config serverExternalPackages에
 * hwpxcore가 등록돼 있어야 한다. (라이브러리의 loadSkeletonHwpx는 ESM
 * 로더에서 Node 분기가 동작하지 않아 직접 해석한다)
 */
function loadSkeleton(): Uint8Array {
  const require = createRequire(import.meta.url);
  const entryPath = require.resolve("@ubermensch1218/hwpxcore"); // .../dist/index.cjs
  const skeletonPath = path.join(
    path.dirname(entryPath),
    "..",
    "assets",
    "Skeleton.hwpx"
  );
  return new Uint8Array(fs.readFileSync(skeletonPath));
}

/**
 * 월간 영농일지 HWPX 바이너리 생성
 */
export async function generateFarmingLogHwpx(input: {
  yearMonth: string; // YYYY-MM
  farm: HwpxFarmInfo;
  logs: HwpxLog[];
}): Promise<Uint8Array> {
  const doc = await HwpxDocument.open(loadSkeleton());

  const [year, month] = input.yearMonth.split("-");
  const titleCharPr = doc.ensureRunStyle({ bold: true });
  doc.addParagraph(`영농일지 (${year}년 ${Number(month)}월)`, {
    charPrIdRef: titleCharPr,
  });
  doc.addParagraph("");

  // 농장 정보
  const farmingTypeLabel = input.farm.farmingType
    ? (FARMING_TYPE_LABELS[input.farm.farmingType as FarmingType] ??
      input.farm.farmingType)
    : null;
  const infoParts = [
    `성명: ${input.farm.userName}`,
    input.farm.region ? `농장 소재지: ${input.farm.region}` : null,
    farmingTypeLabel ? `재배 형태: ${farmingTypeLabel}` : null,
    input.farm.areaPyeong ? `재배 면적: ${input.farm.areaPyeong}평` : null,
  ].filter((v): v is string => v !== null);
  for (const line of infoParts) {
    doc.addParagraph(line);
  }
  doc.addParagraph("");

  // 작업 내역 표
  const rows = buildFarmingLogRows(input.logs);
  const tablePara = doc.addParagraph("");
  const table = tablePara.addTable(rows.length + 1, LOG_TABLE_HEADER.length);
  LOG_TABLE_HEADER.forEach((label, col) => table.setCellText(0, col, label));
  rows.forEach((row, rowIndex) => {
    row.forEach((value, col) => table.setCellText(rowIndex + 1, col, value));
  });

  return doc.save();
}
