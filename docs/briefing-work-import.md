# Work 보고서 가져오기·보관 (work-observations-v1)

작성일: 2026-09-14. 개발 계획 §4(원문 인수 기준)와 통합 지침 §7(외부 가져오기)을 구현한 기능이다.

## 목적과 원칙

- 사용자가 내보낸 주간 보고서의 **Markdown 원문**과 **관측 JSON**을 바이트 그대로 보관한다. 보관본은 수정·삭제 API가 없다.
- 정정은 원본을 덮어쓰지 않고 `parentId`로 연결된 새 버전(`version = 부모 + 1`)으로 남기며 `correctionReason`이 필수다.
- 같은 사용자·같은 내용(`sha256([markdown, json])`)은 한 번만 보관한다 (`@@unique([userId, contentHash])`). 공백 하나만 달라도 다른 버전이다.
- JSON은 알려진 구조(`work-observations-v1`)일 때만 통계를 계산하고, 구조가 다르면 `UNSUPPORTED`로 표시하고 원문만 보관한다. 필드·관측값을 추측해 채우지 않는다.
- 가져온 값은 **시장 전체 공개 일별 평균의 단순평균**(`public-daily-simple-mean-v1`)이며 경매 원거래 가중평균(`auction-unit-weighted-v1`)과 다른 시계열이다. 같은 추세선으로 잇지 않는다.
- Markdown 본문의 표는 통계 원장으로 승격하지 않는다. `sourceUrl`은 저장만 하고 서버가 방문하지 않는다(SSRF 방지).

## 파일

| 경로 | 역할 |
| --- | --- |
| `src/lib/briefing/work-import-contracts.ts` | 입력 Zod 스키마·크기 한도·v1 구조 스키마·정규화 타입 |
| `src/lib/briefing/work-import.ts` | 해시, JSON 파싱, v1 어댑터(`normalizeWorkJson`), 오류 클래스 |
| `src/lib/briefing/work-import-stats.ts` | KST 월요일 기준 주 분할, 등급별 주간 단순평균, 0 이하 값 제외 |
| `src/lib/briefing/work-import-service.ts` | 미리보기·보관·목록·상세 (소유자 격리, 부모 검증, 중복 409) |
| `src/lib/briefing/work-import-summary.ts` | 스냅샷 통합용 `summarizeWorkImportSource` |
| `src/app/api/briefings/imports/route.ts` | `GET` 목록, `POST {action: preview\|import, input}` |
| `src/app/api/briefings/imports/[id]/route.ts` | `GET` 상세 (원문 포함) |
| `src/components/reports/WorkReportImports.tsx` | 화면 컨테이너 (`/reports` 탭 장착은 루트 담당) |
| `src/components/reports/work-imports/*` | 폼·미리보기·목록·상세·통계 표·데이터 훅 |

## 입력 계약 (`workImportInputSchema`)

| 필드 | 제한 |
| --- | --- |
| `title` | 1~200자, 제어문자 제거 |
| `sourceUrl` | 선택, http/https만, 2000자 |
| `periodStart` / `periodEnd` | 선택, `YYYY-MM-DD` 실제 날짜, 시작 ≤ 종료. KST 자정으로 저장 |
| `markdown` | 필수, 공백만은 불가, 512KB(문자 수) |
| `json` | 선택, 1MB. 구문 오류여도 거부하지 않고 `UNSUPPORTED`(원문만 보관)로 저장 |
| `parentId` + `correctionReason` | 둘 다 있거나 둘 다 없어야 함. 사유 1~1000자 |

요청 본문은 2MB까지 읽고 초과 시 413. 알 수 없는 키는 거부한다.

## work-observations-v1 어댑터

계획서 §4와 코디네이터가 공유 페이지에서 확인한 내용(`tomato_observations_2026-09-14_1100.json`: `sources`는 `{jujube, round, hanjin}` URL 객체, `observationWindow`는 문자열, `method`는 가락시장 전체 공개 일별 등급 평균, `gradeOrder=[특,상,중,하]`, `jujube.packageKg=3`, `round.packageKg=5`, 원거래·거래량 미확보)을 반영했다. 전체 파일은 아직 저장소에 없으므로 아래는 **보수적 해석**이며, 실제 파일이 확보되면 스키마를 좁혀야 한다.

```jsonc
{
  "schemaVersion": 1,                     // 필수, 정확히 1
  "gradeOrder": ["특", "상", "중", "하"],  // 필수, 1~10개, 중복 불가
  "observationWindow": "...",             // 문자열 그대로 보존 (시각 정밀도 유지, 수신시각으로 대체하지 않음)
  "sources": { "jujube": "URL", "round": "URL", "hanjin": "URL" },   // 객체 또는 배열, 그대로 보존. sourceCount = 키 수
  "method": "...", "correction": ..., "limits": ...,                 // 그대로 보존
  "jujube": { "packageKg": 3, "rows": [["2026-09-01", 30000, 25000, 20000, null], ...] },
  "round":  { "packageKg": 5, "rows": [...] },
  "rows":   [...],                         // 품종 미구분 시계열 (있을 때만)
  "smartstore": { "observations": [], "panelEstablished": false }
}
```

- 행은 `[YYYY-MM-DD, 값×gradeOrder.length]`. 값은 유한수 또는 `null`. 길이 불일치·날짜 오류·문자열 값·같은 시계열 안의 중복 날짜가 하나라도 있으면 **파일 전체를 `UNSUPPORTED`** 로 두고 사유를 기록한다.
- `0` 이하 값은 평균에서 제외하고 `excluded[{date, grade, value, reason: NON_POSITIVE}]`로 남긴다. `null`은 관측 없음이다.
- 주간 평균: 날짜 문자열 기준 월~일(KST) 구간으로 나누어 등급별 단순평균, `sampleCount`(유효 일수), `dayCount`(행이 있는 일수)를 함께 저장한다. 표본이 없으면 `mean: null`.
- JSON 구문 오류: 파일을 거부하지 않고 원문 텍스트를 그대로 보관하며 `UNSUPPORTED` + "JSON 구문 오류" 사유를 붙인다. 파서 오류 문구(원문 일부 포함 가능)는 기록하지 않는다.
- 결과 상태: `SUPPORTED` / `UNSUPPORTED` / `MARKDOWN_ONLY`. `normalized` 컬럼은 파생값이므로 원문에서 재계산 가능하다.

## 스냅샷 통합 (`summarizeWorkImportSource`)

루트가 `snapshot.ts`에 연결할 수 있도록 `{ source, metrics, limitations }`를 반환한다.

- `source.id = work-import:<id>`, 제목·비고는 모두 템플릿 문자열이다. 사용자의 제목·Markdown·JSON 본문은 전달하지 않는다(프롬프트 주입 방지). `limitations`에는 템플릿 사유 첫 줄만 전달한다. 사용자 파일에서 유래하는 토큰은 등급명(`gradeOrder`, 20자·10개 이하)뿐이다.
- 루트의 `supplemental-sources.ts`는 `normalized`를 직접 읽는다. 참조하는 필드(`status`, `statisticsVersion`, `series[].label/packageKg/weekly[].weekStart/weekEnd/grades[].grade/mean/dayCount`)는 호환성을 유지해야 한다.
- 지표 단위는 `원/3kg(공개일별평균 단순평균)`처럼 정의를 포함하고, 최대 200개까지만 전달하며 초과분은 `limitations`에 기록한다.
- `SUPPORTED`가 아니면 `status: NOT_COLLECTED`, 지표 없음.
- 반환값은 `snapshotSchema`의 `sources`/`metrics`/`limitations` 항목과 호환된다(테스트로 확인).

## 화면

- 제목·출처 링크·기간, Markdown(텍스트 또는 파일), JSON(텍스트 또는 파일), 정정 대상·사유 입력 → **미리보기** → **이대로 보관**.
- 파일은 브라우저에서 읽어 텍스트 영역에 채울 뿐 업로드하지 않는다. 1MB 초과 파일은 읽지 않는다.
- 미리보기에 중복이 표시되면 보관 버튼이 비활성화된다. 입력이 바뀌면 미리보기는 사라진다.
- 목록은 원본과 정정 버전을 분리해 보관 시각·기간·상태를 보여 주고, 상세는 원문을 `<pre>` 텍스트로만 표시한다(HTML/Markdown 렌더링 없음). 링크는 `rel="noopener noreferrer nofollow"`.

## 테스트

| 파일 | 내용 |
| --- | --- |
| `src/__tests__/briefing/work-import.test.ts` | 어댑터·통계·입력 스키마·요약 함수 (단순평균 ≠ 가중평균, 잘못된 행, 미지원 구조, 해시) |
| `src/__tests__/briefing/work-import.integration.test.ts` | 임시 SQLite: 미리보기 무저장, 소유자 격리, 정정 버전·원본 불변·삭제 제한, 중복 409, 크기/형식(400·413), 구문 오류 JSON raw-only 보관, XSS 원문 보존, 통계 정의 구분 |
| `src/__tests__/briefing/work-import-ui.test.tsx` | 미리보기→보관 흐름, 중복 차단, 파일 읽기·크기 거부, 목록/상세/정정 시작, 원문 텍스트 렌더링 |

## 남은 과제

- 실제 Work 첨부 JSON을 확보하면 `workObservationsV1Schema`를 실제 필드 타입으로 좁힌다.
- `/reports` 페이지 장착과 `snapshot.ts` 연결은 루트 담당. 연결 시 어떤 보관본(최신 정정 버전 등)을 사용할지 정책이 필요하다.
- 보관본 삭제·비공개 처리는 의도적으로 없다. 필요하면 별도 승인 후 설계한다.
