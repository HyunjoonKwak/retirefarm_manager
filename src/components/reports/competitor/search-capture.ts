import { z } from "zod";
import { normalizeDiscoverySourceUrl, parseDiscoveryProductUrl } from "@/lib/briefing/discovery-contracts";

const product = z.string().max(2000).refine(value => parseDiscoveryProductUrl(value) !== null);
const schema = z.object({
  schemaVersion: z.literal("retirefarm-visible-search-v1"), sourceUrl: z.string().max(2000), query: z.string().trim().min(1).max(100),
  capturedAt: z.string().datetime({ offset: true }), searchSort: z.string().trim().min(1).max(80),
  searchEnvironment: z.literal("BROWSER_UNSPECIFIED"),
  items: z.array(z.object({ productUrl: product.nullable(), urlStatus: z.enum(["DIRECT", "COMPOSED", "UNRESOLVED"]),
    title: z.string().trim().min(1).max(300), storeName: z.string().trim().min(1).max(100), position: z.number().int().min(1).max(200),
    adStatus: z.enum(["AD", "UNKNOWN"]), purchaseLabel: z.string().max(100), reviewCount: z.number().int().min(0).max(100000000).nullable(),
    reviewBasis: z.literal("UNKNOWN"),
  }).strict().refine(item => (item.urlStatus === "UNRESOLVED") === (item.productUrl === null))).min(1).max(20),
}).strict();
export type SearchCapture = z.infer<typeof schema>;
export function readSearchCapture(input: unknown, now = new Date()): SearchCapture {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error("검색 화면 수집 파일의 형식을 확인해 주세요.");
  const capture = parsed.data;
  const sourceUrl = normalizeDiscoverySourceUrl(capture.sourceUrl);
  if (!sourceUrl || new URL(sourceUrl).pathname !== "/ns/search" || new URL(sourceUrl).searchParams.get("query")?.trim().replace(/\s+/g, " ").toLowerCase() !== capture.query.replace(/\s+/g, " ").toLowerCase())
    throw new Error("검색 출처 주소와 검색어가 일치하지 않습니다.");
  const age = now.getTime() - new Date(capture.capturedAt).getTime();
  if (age < 0 || age > 86400000) throw new Error("최근 24시간 이내 검색 화면 자료만 가져올 수 있습니다. 다시 수집해 주세요.");
  if (new Set(capture.items.map(item => item.position)).size !== capture.items.length) throw new Error("검색 결과 위치가 중복되어 있습니다.");
  return { ...capture, sourceUrl };
}
