# 프로젝트 공동 리뷰 — 2026-09-06

대상: 현재 `retirefarm_manager` 작업 디렉터리. Codex와 기존 Claude 세션을 Orca Run `run_ccf471e9ae70`으로 연결하여 범위를 분담했다. 소스 수정, 운영 API 호출, DB 변경 없이 리뷰했다. 보고서만 추가한다.

- Codex: 인증/인가, 백업/복원, 운영 구성, 실행 검증과 근거 재현.
- Claude: 화면 흐름, 계산, funding/retirement/reports 데이터 일관성.
- 비용 관리: 기존 Claude 세션 하나만 재사용, 하위 에이전트 추가 없음, 범위 분리, 검증 명령은 Codex가 한 번씩 실행.
- 실제 모델별 토큰 합계는 이 도구에서 집계하지 않았으므로 수치로 주장하지 않는다.

## 우선 수정할 문제 — Codex 확인

### R1 · P1 · 첫 카카오 로그인 계정이 기존 관리자 계정을 차지할 수 있음

근거: `src/lib/auth/options.ts:55–76`.

카카오 연결 계정이 하나도 없고 기존 ADMIN이 있는 상태에서, 기존 관리자와 이메일이 다른 카카오 사용자가 먼저 로그인하면 기존 ADMIN의 kakaoId와 email을 해당 사용자 것으로 변경한다. 이 조건은 기존 DB의 카카오 로그인 전환 시 발생할 수 있다. 관리자 소유권을 입증하는 별도 확인이 없다.

검증: 실제 signIn 콜백을 TypeScript에서 변환해 mock Prisma로 실행했다. 다른 이메일의 사용자가 `existing-admin`에 연결되는 것을 assert로 확인했다. 실제 계정은 변경하지 않았다.

수정: 관리자 연결은 사전 지정한 카카오 식별자 또는 소유권 확인을 거친 일회성 절차로 제한하고, 일반 로그인에서 자동 관리자 연결을 제거한다. 동일 이메일 자동 연결도 검증된 이메일/명시적 연결 정책을 적용한다.

### R2 · P1 · 일반 사용자에게 전체 DB 백업 다운로드·복원·삭제 권한이 열려 있음

근거: `src/app/api/backup/download/route.ts:12–15`, `src/app/api/backup/restore/route.ts:24–27`, `src/app/api/backup/route.ts:104–107`.

API는 session.user.id 존재만 검사하고 ADMIN 여부를 검사하지 않는다. 카카오로 새 USER를 만들 수 있어 일반 사용자가 모든 사용자의 데이터가 포함된 DB를 다운로드하거나 전체 DB를 과거 상태로 복원할 수 있다. 목록, 수동 생성, 삭제, 스케줄 변경도 같은 인증 패턴이다.

검증: USER 역할의 mock 세션으로 실제 download/restore 핸들러를 실행해 200 응답과 파일 읽기/덮어쓰기 호출을 확인했다. 파일 I/O는 전부 mock 처리했다.

수정: 모든 전역 백업 API에 공통 관리자 가드를 적용하고, USER=403 / ADMIN=허용을 검증하는 권한 테스트를 추가한다. UI 숨김만으로 해결하지 않는다.

### R3 · P1 · 자동 백업 `.db.gz`를 복원하면 압축 파일로 DB를 덮어씀

근거: `scripts/backup-cron.sh:65–66`, `src/app/api/backup/route.ts:29`, `src/components/settings/BackupManager.tsx:400`, `src/app/api/backup/restore/route.ts:55–56`.

자동 백업은 gzip으로 압축되고 목록 API는 `.db.gz`도 반환한다. UI는 이 파일에도 복원 버튼을 제공한다. 복원 API는 압축을 풀거나 SQLite 파일인지 검사하지 않고 운영 `.db` 경로에 그대로 copyFile 한다. 성공 응답과 달리 결과물은 SQLite DB가 아니어서 DB 접근이 실패할 수 있다.

검증: `.db.gz` 파일명을 넣어 실제 복원 핸들러의 mock 실행에서 압축 파일 → DB 경로 복사와 200 응답을 확인했다.

수정: 임시 위치에서 압축 해제, SQLite 무결성·스키마 확인 후 복원한다. 운영 연결과 쓰기를 안전하게 중단하고 복원 절차를 수행한다. 복원 전 안전 백업이 실패하면 진행하지 않는다. 현재 코드는 안전 백업 실패도 로그만 남기고 덮어쓰기를 계속한다.

### R4 · P2 · 자동 백업 설정 저장이 실제 실행 설정에 반영되지 않음

근거: `src/app/api/backup/schedule/route.ts:7–8,95–102`, `scripts/backup-cron.sh:10,27–43,81`.

API 기본 저장 경로는 `/backups/config/backup-schedule.json`이지만 호스트 스크립트는 프로젝트의 `data/backup-schedule.json`을 읽는다. 제공된 compose 구성에서는 서로 다른 호스트 경로다. 더구나 API는 crontab을 갱신하지 않고 스크립트도 dayOfWeek/hour/minute를 읽지 않는다. UI에서 저장 성공이 떠도 요일·시각 변경이 실행 시각에 적용되지 않는다. 외부에 별도 연결 작업이 있는지는 확인하지 않았다.

수정: 설정의 단일 경로와 실제 스케줄 적용 주체를 정하고 저장 이후 적용 상태를 확인한다. enabled·보관 기간·요일·시각이 실행 측까지 전달되는 통합 검증이 필요하다.

### R5 · P2 · 백업 스케줄의 필수 숫자 필드가 없어도 저장 성공

근거: `src/app/api/backup/schedule/route.ts:62–85`.

`undefined < 0` 같은 비교가 false여서 `{ "enabled": true }`만 보내도 모든 숫자 범위 검사를 통과한다. 문자열/소수도 일관되게 거부하지 않는다.

검증: 실제 POST 핸들러 mock 실행에서 200 응답과 enabled만 있는 설정 저장을 확인했다.

수정: Zod의 필수 숫자·정수·범위 검증으로 통일한다. R4와 함께 처리하는 것이 효율적이다.

## 검증 결과와 개선 사항

- `npm run db:generate`: 성공.
- `NEXT_PHASE=phase-production-build npm run build`: 성공. 빌드 시 스케줄러 초기화를 건너뛰는 프로젝트 가드를 명시적으로 적용했다.
- `npm run typecheck`: 성공.
- `npm run lint`: 오류 0, 경고 33. 미사용 항목과 hook 의존성 경고가 포함된다.
- `npm test`: 테스트 파일 6개, 테스트 62개 중 61개 통과/1개 실패.
- 실패: `src/__tests__/services/garak-market.test.ts:130–133`. 2026-09-06 일요일 오전 06시 이후에 실행했을 때 주 1회 일요일 06시의 다음 시각이 null이다. `src/lib/scheduler.ts:43`의 `i < 7`은 오늘부터 6일 후까지만 탐색해 7일 후를 놓친다.
- 위 helper는 현재 테스트에서만 호출된다. 실제 cron 수집 중단으로 확대 해석하지 않는다. 탐색 경계 수정과 가짜 시계로 고정된 테스트가 필요하다.
- 현재 테스트는 서비스·유틸·계산 중심이며 인증/권한/복원 API의 회귀 테스트가 없다. R1–R3의 부정 경로 테스트를 먼저 추가한다.
- 운영 DB 백업은 실행 중인 SQLite 파일의 단순 복사 방식이다. 위 R3 수정 시 일관된 snapshot 및 활성 연결 처리까지 함께 설계한다. 동시 쓰기 상황의 실제 손상 재현은 이번 범위에서 하지 않았다.
- README는 생성 템플릿 상태이며 CLAUDE.md는 Portal SSO라고 설명하지만 실제 인증은 Kakao다. 설치·인증 전환·환경 변수·백업 복원 절차를 실제 구성에 맞게 문서화한다.

검증 로그와 격리 재현 스크립트는 `/tmp/retirefarm-review-{build,typecheck,lint,test}.log`, `/tmp/retirefarm-review-probe.cjs`에 있다. `/tmp` 산출물은 임시 파일이다. 운영 Docker 기동/실사용자 로그인/브라우저 E2E/운영 DB 복원은 수행하지 않았다.

## Claude 검토 결과 — 통합 우선순위

아래 원본의 A1–A5는 모두 P2로 분류한다. A1의 생활비 버퍼 차이는 계산 목적/표시 문제를 포함하며, quantity 차이는 현재 UI가 아니라 API에서 quantity > 1을 입력했을 때 드러난다. A2는 특히 이전 달에 등록했지만 아직 지출하지 않은 항목의 누락이 문제다. 과거 자금은 initialCash에 사용자가 반영했을 수 있으므로 자동 누락으로 단정하지 않는다.

Codex가 A3·A5를 실제 funding/summary 핸들러에 mock Prisma/세션을 넣어 추가 확인했다. KST에서 2026-09-30 자금 1,000원은 전체 합계에는 잡히나 9월 monthlyFlow에는 0원으로 나온다. amount=1500000.5이면 실제 핸들러가 500을 반환한다. 소수 자금원은 자금 요약에, 소수 거래 금액은 해당 거래를 읽는 보고서에 영향을 준다.

수정 순서 제안: (1) R1–R3 인증·백업 안전성, (2) A3·A5 월 경계와 금액 검증, (3) A2·A4 지출/완료 시점 모델, (4) R4–R5 스케줄 적용 및 A1 계산 기준 통일. 구현 시 Codex는 서버 권한/복원과 재현 검증, Claude는 날짜·금액 모델과 관련 화면 변경을 맡고 서로 변경분을 리뷰하면 범위를 겹치지 않을 수 있다. 이번 작업은 리뷰까지만 수행했다.

### Claude 상세 근거

# Retirefarm Manager — Claude 읽기 전용 리뷰 (계산/데이터 일관성 · 사용자 흐름 · 스키마 의미)

- 대상: `src/components`, `src/app/(main)` 페이지 흐름, `src/lib/calculators`, `api/reports|retirement|funding|plan`, `prisma/schema.prisma`
- 제외(Codex 담당): 인증/인가, backup, 운영설정, test/lint/typecheck/build
- 방법: 코드 정독만 수행. 소스/DB/네트워크 변경 없음. 아래 항목은 모두 실제 코드 라인으로 재현 경로를 확인함.
- 기준 커밋: `1fa8361` (main)

---

## A. 입증된 문제 (상위 5)

### 1. "필요 자금·달성률"이 /setup 과 /plan 에서 다른 공식으로 계산됨
- 위치
  - `src/app/api/funding/summary/route.ts:67-78` — `requiredAmount = Σ(estimatedCost × quantity) − ΣsubsidyAmount`, `fundingRatio = totalAmount / requiredAmount`, `fundingGap`은 음수 허용
  - `src/lib/validations/plan.ts:89-110` (호출: `src/app/api/plan/route.ts:98-106`) — `totalSetupCost = Σ estimatedCost` (**quantity 미반영**), `totalRequiredFunds = netSetupCost + initialLivingBuffer`, `fundingGap = max(0, …)`, `fundingProgress = planned / totalRequiredFunds`
  - 화면: `src/components/funding/FundingPlanManager.tsx:362-388` ("필요 자금 / 자금 부족 / 달성률") vs `src/components/plan/SmartFarmPlanDashboard.tsx:335-345` ("총 필요 자금 / 확보 진행률"). 두 컴포넌트는 각각 `/setup`(`src/app/(main)/setup/page.tsx:2-4`)과 `/plan`에 마운트.
- 발생 조건: 플랜 폼에 월 생활비를 입력하면(기본 bufferMonths=6) 항상 두 값이 달라짐. `quantity > 1` 차이는 UI에 quantity 입력이 없어 API 직접 호출 시에만 드러나는 잠재 불일치.
- 영향: 동일 데이터에 대해 두 페이지가 서로 다른 "부족액"과 "달성률"을 보여줌. `readinessScore` 40점 배점(`plan.ts:116`)도 plan 공식만 따름.
- 수정 방향: `src/lib/calculators/`에 설립비·보조금·버퍼·조달액을 계산하는 단일 함수를 두고 `funding/summary`·`plan`·`cash-flow` 세 라우트가 공유. quantity 곱 여부와 버퍼 포함 여부를 한 곳에서 결정하고, 화면 라벨에 "설립비 기준 / 생활비 버퍼 포함"을 명시.

### 2. 현금흐름 예측이 설립비 지출일을 `createdAt`으로 잡아, 이전 달에 등록한 항목이 예측에서 통째로 빠짐
- 위치
  - `src/app/api/funding/cash-flow/route.ts:50-54` — `expectedDate: item.createdAt` (주석: "별도 예정일 없음")
  - `src/lib/calculators/cash-flow-projection.ts:104,110-113,135-137` — `startMonth = 이번 달 1일`부터 앞으로만 순회하므로 `createdAt < startMonth`인 항목은 어떤 달에도 매칭되지 않음
  - 같은 경로로 `expectedDate`가 과거인 자금원도 탈락하며(`:120-122`) `initialCash`에도 합산되지 않음
- 발생 조건: 설립비 항목을 등록한 달이 지나면 즉시. 시간이 지날수록 유출이 줄어드는 방향으로 왜곡.
- 영향: `totalOutflow`·`lowestPoint`·`breakEvenMonth`가 실제보다 낙관적. 또한 `status`(INSTALLED)·`actualCost`를 무시하고 `estimatedCost`를 그대로 미래 유출로 계상해 이미 지출한 항목이 이중 반영될 수 있음.
- 수정 방향: `SetupCostItem`에 지출 예정일(또는 예정 월) 필드를 추가하고 없으면 `farmStartDate`/현재 달로 폴백. `actualCost`가 있거나 `INSTALLED`인 항목은 "이미 지출"로 분리. 과거 자금원은 `initialCash`에 포함할지 사용자에게 명시.

### 3. 자금 요약 `monthlyFlow`가 월 마지막 날 자금원을 누락 (TZ=Asia/Seoul 환경)
- 위치
  - `src/app/api/funding/summary/route.ts:85-91` — `monthEnd = new Date(y, m+1, 0)` = 해당 달 마지막 날 **00:00 로컬**
  - 입력 경로: `<input type="date">` 값 `"YYYY-MM-DD"`를 그대로 전송(`FundingPlanManager.tsx:215,266`) → `new Date("2026-09-30")` = UTC 00:00 = **KST 09:00** 으로 저장(`src/app/api/funding/route.ts:79`)
  - 런타임 TZ: `Dockerfile:32`, `docker-compose.yml:9` `TZ=Asia/Seoul`
- 발생 조건: `expectedDate`가 월 마지막 날(30/31일)인 자금원.
- 영향: "월별 자금 유입" 카드(`FundingPlanManager.tsx:534-550`)에서 해당 건 누락, 12개월 합계가 목록 합계와 불일치. 같은 버그를 `cash-flow-projection.ts:113`은 이미 `23:59:59.999`로 고쳤으므로 두 계산이 서로 다름.
- 수정 방향: `api/farm/logs/route.ts:44-50`처럼 `gte: 1일, lt: 다음달 1일`로 통일하거나 월 버킷팅 유틸을 공유. 날짜 전용 값은 저장 시 로컬 자정으로 정규화하는 것도 검토.

### 4. 작물 완료일을 `updatedAt`에서 파생 → 편집만 해도 재배일수·월간 집계가 바뀜 (스키마 의미 불일치)
- 위치
  - `src/app/api/reports/crop-analysis/route.ts:66-70, 165-169` — COMPLETED/FAILED면 `endDate = crop.updatedAt`
  - `src/app/api/reports/monthly/route.ts:61-76` — COMPLETED/HARVESTING 작물을 `updatedAt` 범위로 집계
  - 스키마 `prisma/schema.prisma:201-220` — `Crop`에 실제 수확일/완료일 없음(`expectedHarvestDate`만), `updatedAt @updatedAt`
  - PATCH가 notes/growthStage/plotId/status 등 모든 편집을 허용(`src/app/api/farm/crops/[id]/route.ts:8-22`), UI에서 status를 Select로 자유롭게 되돌릴 수 있음(`src/components/farm/CropManager.tsx:165-170,341`)
- 발생 조건: 완료된 작물의 어떤 필드든 나중에 수정.
- 영향: `cultivationDays`가 편집 시점까지 늘어나고 `dailyProfit`도 달라짐. 월간 보고서의 completed 건수가 편집한 달로 이동해 연간 `successRate`와 월간 합이 맞지 않음.
- 수정 방향: `Crop`에 `completedAt`(또는 `actualHarvestDate`) 추가, status 전이 시 서버에서 설정. 보고서는 그 필드로만 집계.

### 5. Decimal → `BigInt(x.toString())` 변환이 정수가 아닌 금액에서 예외 → 요약/보고서 전체 500
- 위치
  - `src/app/api/funding/summary/route.ts:41` / `src/app/api/reports/annual/route.ts:66,87` / `monthly/route.ts:95,112,168` / `crop-analysis/route.ts:56,156`
  - 입력 검증이 소수를 허용: `src/app/api/funding/route.ts:10` `z.number().min(0)`, `src/app/api/farm/finance/route.ts:12` `z.number().min(1)`; 클라이언트는 number input 값을 `Number()`로 그대로 전송(`FundingPlanManager.tsx:214,265`, `FinanceManager.tsx:147`)
- 발생 조건: 금액에 소수점이 한 건이라도 저장되면 (예: `1500000.5`) `BigInt("1500000.5")`가 `SyntaxError`.
- 영향: 소수 자금원은 자금 요약을, 소수 거래 금액은 그 거래를 집계하는 월간/연간 보고서·작물 분석을 500으로 만들 수 있음. 잘못된 한 행이 페이지 전체를 막음.
- 수정 방향: 금액 스키마를 `z.number().int()`(또는 `z.coerce.number().int()`)로 강제하고, 집계는 정한 통화 단위에 맞는 Decimal/정수 연산으로 통일. 기존 소수 데이터는 정책 확인 없이 반올림하지 않고 처리 방식을 정한다.

---

## B. 부차 항목 (근거는 있으나 우선순위 낮음)

- **subsidyRate가 저장만 되고 어디에도 적용되지 않음**: `setup/items/route.ts:21`, `[id]/route.ts:16`에서 받지만 모든 집계는 `subsidyAmount`만 읽음(`setup/summary:50`, `funding/summary:68`, `plan/route.ts:100`, `cash-flow:52`). 다만 현재 UI(`components/setup/*`)는 보조금 입력 자체를 노출하지 않아 잠재 문제.
- **레거시 은퇴 API/컴포넌트가 살아 있고 /plan과 다른 숫자를 냄**: `/retirement`, `/retirement/goal`은 `/plan`으로 redirect하고 `RetirementDashboard.tsx`는 미마운트, `src/lib/validations/retirement.ts`는 미참조. 그런데 `api/retirement/simulation/route.ts:51`은 `netValue = totalValue − loan`(plan은 `:72`에서 deposit까지 차감), 설립비도 quantity 미반영. 삭제 또는 `/api/plan`으로 통합 권장.
- **crop-analysis N+1**: `crop-analysis/route.ts:143-150` 작물마다 `findMany`. 작물 수 증가 시 지연. `relatedCropId in [...]` 한 번 조회 후 그룹핑으로 대체 가능.
- **연간 보고서 월평균이 진행 중인 해에도 /12**: `annual/route.ts:184-185`. 올해 보고서에서 평균이 과소.
- **`FundingSource.status` 열거값이 라우트 3곳에 하드코딩**: `funding/route.ts:14`, `[id]/route.ts:14`, `summary/route.ts:31-35`. `summary:45-50`은 미정의 키에서 TypeError → 500. 상수 하나로 묶기.

## C. 불확실 / 설계 확인 필요 (버그로 단정하지 않음)

- **`HubNetWorthCache`가 싱글턴이라 다중 사용자 스키마와 충돌**: `schema.prisma:76-82`에 userId 없음, `getNetWorthSummary()`(`external-snapshot.ts:116`)는 사용자 인자를 받지 않고 `plan/route.ts:49`가 모든 로그인 사용자에 대해 호출. `User.role`(ADMIN/USER)이 있는 스키마와 의미가 어긋나지만 §8-8 결정(단일 소스)의 의도일 수 있음. 단일 사용자 운영이 전제라면 문서화, 아니라면 캐시에 userId 추가 필요. (권한 측면은 Codex 범위)
- **퇴직금 이중 입력 가능성**: `RetirementGoal.estimatedRetirementPay/SeverancePay`와 `FundingSource.type = RETIREMENT_PAY/SEVERANCE_PAY`가 별개. `calculateSmartFarmPlanSummary`는 전자를 `totalRetirementFunds`로만 표시하고 갭 계산에는 후자만 씀(`plan.ts:86,94,106`). 의도된 분리인지, 자동 연동(자금원 자동 생성)이 목표인지 확인 필요.
- **보조금 이중 계상 가능성**: `SetupCostItem.subsidyAmount`(필요액에서 차감)와 `FundingSource.type = GOVERNMENT_SUBSIDY`(조달액에 가산)를 둘 다 입력하면 같은 보조금이 양쪽에 반영됨. 한쪽만 쓰도록 안내하거나 상호 배타 규칙 필요.

## D. 리뷰 범위 밖으로 남긴 것
- 인증/인가·권한 우회, backup, 운영설정, 빌드/테스트 결과 — Codex 담당.
- 시세(market) 도메인 계산 — 이번 요청 범위 외.
