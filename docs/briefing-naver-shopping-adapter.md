# Briefing — Naver Shopping 검색 어댑터 계약

> 폐기된 공급자 계약: 공식 쇼핑검색 API는 2026-07-31 종료됐다([공식 공지](https://developers.naver.com/notice/article/32564)). 아래는 기존 구현 기록이며 신규 키 설정·실서비스 연결 지침이 아니다. [대체 수집 계획](reviews/2026-09-14-browser-competitor-collection-plan.md)을 참고한다.

파일: `src/lib/briefing/naver-shopping.ts` · 테스트: `src/__tests__/briefing/naver-shopping.test.ts`

공식 문서(2026-09-14 확인): https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md

## 요청

| 항목 | 값 |
|---|---|
| Endpoint | `GET https://openapi.naver.com/v1/search/shop.json` (고정, 프록시·대체 경로 없음) |
| Query | `query=<trimmed>&display=100&start=1&sort=sim` — 1페이지만 |
| Headers | `X-Naver-Client-Id`, `X-Naver-Client-Secret`, `Accept: application/json` |
| Timeout | `AbortSignal.timeout(12_000)` |
| Redirect | `redirect: "error"` — 3xx 응답도 `REDIRECT` 오류 |
| Retry | 없음 (429·5xx 포함 1회 호출 후 즉시 실패) |
| Body limit | 1 MiB (Content-Length 선검사 + 스트림 누적 검사) |

```ts
searchNaverShopping(query: string, credentials: ShoppingCredentials, fetcher = fetch, options?: { now?: () => Date }): Promise<ShoppingSearchResult>
```

`query`: 공백 정규화 후 1~100자, 제어문자 금지. `credentials`: 두 값 모두 비공백 ASCII(헤더 인젝션 방지). 둘 다 네트워크 호출 전에 검증된다.

## 오류 — `ShoppingSearchError { code, status }`

| code | status | 원인 |
|---|---|---|
| `INVALID_QUERY` / `INVALID_CREDENTIALS` | null | 호출 전 검증 실패 |
| `AUTH_FAILED` | 401 | 클라이언트 아이디/시크릿 오류 (공통 코드 024) |
| `FORBIDDEN` | 403 | 검색 API 권한 미설정·HTTP 호출 |
| `RATE_LIMITED` | 429 | 일일/초당 한도 초과 |
| `BAD_REQUEST` | 400·404 등 4xx | SE01~SE06 등 |
| `UPSTREAM_ERROR` | 5xx·기타 | SE99 |
| `REDIRECT` | 3xx 또는 null | 리디렉션 반환/거부 |
| `TIMEOUT` / `NETWORK` | null | 12초 초과 / 연결 실패 |
| `RESPONSE_TOO_LARGE` | 200 | 1 MiB 초과 |
| `INVALID_RESPONSE` | 200 | JSON 아님, `total`/`items` 누락, `productId` 공백, 정수 아닌 `lprice`, 100개 초과 |

`message`는 코드별 고정 한국어 문자열이며 업스트림 본문·헤더·검색어·자격증명을 절대 포함하지 않는다.

## 결과 — `ShoppingSearchResult`

```ts
{ query, sort: "sim", observedAt: ISO, total, items: ShoppingCandidate[], excludedCount }
```

`ShoppingCandidate` 필드별 규칙:

- `productId` — 문자열화·trim, 비어 있으면 응답 전체가 `INVALID_RESPONSE`.
- `title` / `mallName` — 태그 제거 → 엔티티 1회 디코드 → 제어문자 제거·공백 축약 → 300/100자 절단. React 텍스트 노드로 안전(마크업 생성 없음).
- `url` — `http:`/`https:`만 허용, userinfo 포함 시 거부. 거부되면 `""` + `URL_REJECTED` + `excluded: true`. 서버는 상품 URL을 절대 fetch하지 않는다.
- `listedPrice` — `lprice` 정수, `0`·음수는 `null`(무료 아님, `PRICE_UNAVAILABLE`). `hprice`는 무시.
- `rank` — 응답 배열 순서(1부터). 소비자 비광고 순위가 아니며 “30개 스토어 커버리지”를 뜻하지 않는다.
- `productType` — 코드 문자열(`"1"`~`"12"`). 1~3 외에는 `PRODUCT_TYPE_NOT_GENERAL`.
- `proposedPackageKg` — 제목에 **단일 bare kg/g 토큰**이 있을 때만 제안(`WEIGHT_PROPOSED_FROM_TITLE`). 토큰 2개 이상, `x2`/`2팩`/`2박스` 등 멀티팩, `~`·`당`·`씩` 등 한정어, 0 또는 50kg 초과 → `null` + `WEIGHT_AMBIGUOUS`. 토큰 없음 → `WEIGHT_MISSING`. 옵션 검증값이 아니다.
- `varietyGroup` — 제목에 `대추` → `JUJUBE`, `원형|동그란|둥근|라운드` → `ROUND`, 둘 다 → `UNKNOWN` + `VARIETY_CONFLICT`, 없음 → `UNKNOWN`.
- `excluded` — 스테비아·주스·분말·가공(건조·모종·씨앗 등) 제목 휴리스틱 또는 URL 거부. 카테고리 문자열이 의심스러우면 제외하지 않고 `CATEGORY_REVIEW`만 붙인다.
- `storeKey` — `https://smartstore.naver.com/<store>/<...>` 정확히 일치할 때만 첫 경로 세그먼트(예약어 제외). `m.smartstore`, `brand.naver.com`, `mallName`은 사용하지 않는다.
- `reviewReasons` — 모든 항목에 `VERIFY_PRICE_OPTION_SHIPPING`이 첫 번째로 들어간다(가격·옵션·배송 확인 필수).

## 보조 export

`normalizeShoppingResponse(body, query, observedAt)` — 저장된 원본 JSON 재정규화용. `cleanShoppingText`, `sanitizeShoppingUrl`, `extractSmartstoreKey`, `proposePackageWeight`, `classifyVariety`, `detectExclusionReasons`, `buildShoppingSearchUrl`, 상수 `NAVER_SHOPPING_ENDPOINT`, `SHOPPING_FETCH_TIMEOUT_MS`, `SHOPPING_MAX_RESPONSE_BYTES`.

## 루트 담당 (어댑터 범위 밖)

자격증명 로딩(`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 등), 저장·스냅샷·UI 통합, 호출 빈도 제어, 결과 캐싱.
