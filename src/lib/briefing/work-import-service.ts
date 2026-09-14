import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { WorkImportInput, WorkImportNormalized } from "./work-import-contracts";
import { WORK_IMPORT_LIMITS } from "./work-import-contracts";
import { hashWorkImport, normalizeWorkImport, parseNormalized, WorkImportError } from "./work-import";

const listSelect = { id: true, title: true, periodStart: true, periodEnd: true, sourceUrl: true, version: true, parentId: true,
  correctionReason: true, contentHash: true, createdAt: true, normalized: true, rawJson: true } satisfies Prisma.WorkReportImportSelect;
type ListRow = Prisma.WorkReportImportGetPayload<{ select: typeof listSelect }>;
export interface WorkImportListItem { id: string; title: string; periodStart: string | null; periodEnd: string | null; sourceUrl: string | null;
  version: number; parentId: string | null; correctionReason: string | null; contentHash: string; createdAt: string;
  status: WorkImportNormalized["status"] | null; hasJson: boolean; seriesCount: number }
export interface WorkImportDetail extends WorkImportListItem { rawMarkdown: string; rawJson: string | null; normalized: WorkImportNormalized | null;
  parent: { id: string; title: string; version: number; createdAt: string } | null;
  corrections: { id: string; title: string; version: number; correctionReason: string | null; createdAt: string }[] }
export interface WorkImportPreview { title: string; contentHash: string; markdownChars: number; jsonChars: number; normalized: WorkImportNormalized;
  duplicateOf: { id: string; title: string; createdAt: string } | null; parent: { id: string; title: string; version: number } | null }

const kstDay = (value: string | undefined) => value ? new Date(`${value}T00:00:00+09:00`) : null;
const toItem = (row: ListRow): WorkImportListItem => {
  const normalized = parseNormalized(row.normalized);
  return { id: row.id, title: row.title, periodStart: row.periodStart?.toISOString() ?? null, periodEnd: row.periodEnd?.toISOString() ?? null,
    sourceUrl: row.sourceUrl, version: row.version, parentId: row.parentId, correctionReason: row.correctionReason, contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(), status: normalized?.status ?? null, hasJson: row.rawJson !== null, seriesCount: normalized?.series.length ?? 0 };
};
/** A correction must point at the caller's own import; other users' ids are indistinguishable from missing ones. */
async function findParent(userId: string, parentId: string | undefined) {
  if (!parentId) return null;
  const parent = await prisma.workReportImport.findFirst({ where: { id: parentId, userId }, select: { id: true, title: true, version: true } });
  if (!parent) throw new WorkImportError("PARENT_NOT_FOUND", 404, "정정할 원본 보고서를 찾을 수 없습니다.");
  return parent;
}
export async function previewWorkImport(userId: string, input: WorkImportInput): Promise<WorkImportPreview> {
  const normalized = normalizeWorkImport(input.json);
  const contentHash = hashWorkImport(input.markdown, input.json);
  const [duplicate, parent] = await Promise.all([
    prisma.workReportImport.findUnique({ where: { userId_contentHash: { userId, contentHash } }, select: { id: true, title: true, createdAt: true } }),
    findParent(userId, input.parentId),
  ]);
  return { title: input.title, contentHash, markdownChars: input.markdown.length, jsonChars: input.json?.length ?? 0, normalized,
    duplicateOf: duplicate ? { ...duplicate, createdAt: duplicate.createdAt.toISOString() } : null, parent };
}
/** Inserts a new immutable version; the unique (userId, contentHash) index is the dedupe authority under concurrency. */
export async function createWorkImport(userId: string, input: WorkImportInput): Promise<WorkImportListItem> {
  const normalized = normalizeWorkImport(input.json);
  const contentHash = hashWorkImport(input.markdown, input.json);
  const parent = await findParent(userId, input.parentId);
  try {
    const row = await prisma.workReportImport.create({ select: listSelect, data: {
      userId, title: input.title, periodStart: kstDay(input.periodStart), periodEnd: kstDay(input.periodEnd), sourceUrl: input.sourceUrl ?? null,
      rawMarkdown: input.markdown, rawJson: input.json ?? null, normalized: JSON.stringify(normalized), contentHash,
      parentId: parent?.id ?? null, correctionReason: parent ? input.correctionReason ?? null : null, version: parent ? parent.version + 1 : 1,
    } });
    return toItem(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new WorkImportError("DUPLICATE", 409, "같은 내용의 보고서가 이미 보관되어 있습니다.");
    throw error;
  }
}
export async function listWorkImports(userId: string): Promise<WorkImportListItem[]> {
  const rows = await prisma.workReportImport.findMany({ where: { userId }, select: listSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: WORK_IMPORT_LIMITS.listSize });
  return rows.map(toItem);
}
export async function getWorkImport(userId: string, id: string): Promise<WorkImportDetail> {
  const row = await prisma.workReportImport.findFirst({ where: { id, userId }, select: { ...listSelect, rawMarkdown: true,
    parent: { select: { id: true, title: true, version: true, createdAt: true } },
    corrections: { select: { id: true, title: true, version: true, correctionReason: true, createdAt: true }, orderBy: { createdAt: "asc" } } } });
  if (!row) throw new WorkImportError("NOT_FOUND", 404, "보관된 보고서를 찾을 수 없습니다.");
  return { ...toItem(row), rawMarkdown: row.rawMarkdown, rawJson: row.rawJson, normalized: parseNormalized(row.normalized),
    parent: row.parent ? { ...row.parent, createdAt: row.parent.createdAt.toISOString() } : null,
    corrections: row.corrections.map(item => ({ ...item, createdAt: item.createdAt.toISOString() })) };
}
