# 2026-09-14 주간 브리핑·경쟁점·텔레그램·보관설정 갭 리뷰

읽기 전용 리뷰. 기준: `docs/retirefarm_codex_integration_guide.md`(이하 가이드) 대 현재 체크아웃(main, `c1c6cfe` + 타 작업자의 `market-recovery.ts` 미커밋 변경). 코드·테스트·빌드·DB는 건드리지 않았다. 리뷰 작성 시 Work 원문은 미제공이었다. 이후 코디네이터가 사용자 공유 링크의 9/7 본문·9/14 추가 보고서·관측 JSON을 확인했다. 최종 결정과 원문 대조는 `2026-09-14-briefing-development-plan.md`를 따른다.

## 1. 실제 구현 현황 (근거 파일)

| 영역 | 가이드 요구 | 현재 코드 | 판정 |
|---|---|---|---|
| 주간 브리핑 저장·화면 | WeeklyBriefing/BriefingRun 모델, 인증 API, 목록·상세 | `prisma/schema.prisma`에 관련 모델 없음. `src/app/api/`에 briefing 라우트 없음. `grep -ri briefing src prisma` 0건 | **미구현** |
| 외부 보고서 가져오기 | Markdown/JSON 구분, Zod·크기·중복키 검증, 미리보기 | 없음 | **미구현** |
| 경쟁점 패널·관측 | CompetitorStore/Product/Observation, SearchSnapshot | `grep -ri competitor src prisma` 0건. `MarketComparisonPreset`(`schema.prisma:455`)은 도매 비교 조건 저장용이라 경쟁점과 무관 | **미구현** |
| 텔레그램 | `telegram.ts` 어댑터, TELEGRAM_BOT_TOKEN, 발송이력 | `grep -ri telegram src prisma docker-compose.yml .env.example` 0건. 알림은 앱 내부 `Notification` 모델(`schema.prisma:438`)과 `notifications/check`뿐 | **미구현** |
| 주간 도매 집계(2단계) | 법인·품종·등급·단위 고정, 전체 거래 가중평균, 절단 금지 | `analysis/route.ts:27-31`은 20,000행 절단 + `truncated` 표시. `garak-market.ts:311` `getDailySummary`는 `_avg.price` 단순평균 | **부분**(재사용 가능, 주간 API 없음) |
| 예약 러너 | 시세 수집과 브리핑 예약 분리, DB lease | `scheduler.ts:216-223` node-cron Asia/Seoul(수집·정리만). `MarketRecoveryJob`(`schema.prisma:376`) lease·attempts 모델 존재 | 참고 구조만 존재 |
| 보관설정 | (가이드 범위 밖, 9/7 후속) | 아래 §2 | 부분 |

가이드 §3 재사용 목록의 경로는 모두 현재 체크아웃에 존재함을 확인했다. 기본 `corporationCodes`는 `"11000101"` 하나(`schema.prisma:362`)이므로 가이드가 전제한 두 법인 수집은 사용자 설정에 달려 있다.

## 2. 보관설정(retention) 실제 구현 차이

- 서버: `MarketCollectionSettings.retentionDays`(기본 90)·`autoCleanupEnabled`(기본 true). PATCH 검증은 `settings/route.ts:17-18`(7~365일). 관리자 전용 정리 API `cleanup/route.ts:96-107`.
- 자동 정리: `garak-collector.ts:724-736` `cleanupOldAuctionData`는 **모든 사용자 설정 중 최대 retentionDays**로 전역 삭제한다. 사용자별 설정처럼 보이지만 실제 자료는 공유된다. 코디네이터 재검토로 scheduler 호출부의 `else if (settings.autoCleanupEnabled)`와 cron의 OFF 검사를 확인했다. 초기 리뷰의 호출부 미확인 판단은 정정한다. 다만 다른 사용자가 켠 정리로 OFF 사용자의 공유 원본까지 지울 수 있었으며 이번 수정으로 전역 OFF 보호를 추가했다.
- UI: `MarketCollectAutoSettings.tsx`·`MarketCollect.tsx`에 `retentionDays`/`autoCleanupEnabled` 편집 컨트롤 없음(grep 0건). 9/7 `market-long-term-storage.md:88`의 "UI는 서버의 365/false를 보존, OFF 표시, 기간 입력 비활성화" 요구는 **UI 미착수** 상태로 보인다. 이번 리뷰에서는 현황만 기록했다. 이후 코디네이터가 해당 UI와 테스트를 구현했다.
- 일별 집계 모델(`Daily*`/`Aggregate*`) 없음. 9/7 §"장기 집계 후속 설계"의 원본→집계 이관은 미구현이므로, 자동 정리를 켜면 90~365일 이전 원본이 삭제된다. 복구 가능성은 별도 백업 존재 여부에 달려 있다.

## 3. 핵심 갭 요약

1. **1~4단계 전부 미착수.** 브리핑·경쟁점·텔레그램은 스키마 수준부터 없다. 가이드 §3 말미의 "이미 추가되었는지 재확인" 결과는 "없음"이다.
2. **주간 기준 집계 API 부재.** 기존 분석은 최근 20,000행 절단이라 가이드 §5 "조용한 절단 금지"를 만족하지 못한다. 최근 커밋 `c1c6cfe`처럼 DB 집계로 전환하는 패턴은 있어 재사용 가능하다.
3. **자동 정리 정책이 전역 max로 동작**하며 호출부 OFF 경로는 존재한다(위 정정 참조). 브리핑이 4주·연간 추이를 쓰려면 원본 보존 정책이 선행돼야 한다.
4. **원문 대조 필요.** 리뷰 후 원문이 제공되어 최종 계획에 대조표를 반영했다. 9/14 오전 원본 전문은 공유본에서 확인하지 못했고 추가 보고서의 정정만 확인했다.
5. 타 작업자가 `market-recovery.ts` 시각 오류와 배포 백업을 수정 중이므로 브리핑 작업은 해당 파일과 `backup/` 경로를 건드리지 않는 범위로 설계해야 한다.

## 4. 원문 대조표 제안 (사용자가 Work 보고서 원문 제공 시 작성)

| 원문 항목 | 원문 위치(주차·섹션) | 원문 값·단위·기간 정의 | 프로젝트 필드/모델 | 이전 방식(그대로/재계산/참고만) | 확인자 |
|---|---|---|---|---|---|
| 예: 도매 주간 평균 | 09/07 §1 | ? (단순/가중, 법인, 등급) | WeeklyBriefing.inputSnapshot | 재계산 후 원문 병기 | 미정 |
| 예: 경쟁점 30곳 가격 | 09/07 §4 | ? (관측시각, 옵션, 배송비 포함 여부) | CompetitorObservation | 참고 표본으로만 | 미정 |
| 예: 우선 행동 3개 | 09/07 말미 | 텍스트 | WeeklyBriefing.summary | 그대로 | 미정 |

규칙: 원문의 수치는 `sourceType=imported-report`로 보존하고 프로젝트 재계산값과 같은 시계열로 잇지 않는다(가이드 §2·§5). 원문 표를 DB 관측으로 승격하는 항목은 사용자가 이 표에서 명시적으로 체크한 것만.

## 5. 사용자 결정 필요 항목

1. Work 보고서 원문 제공 형식: Markdown 전문만 vs 주차별 JSON 내보내기 가능 여부. 최소 2주분(최신+직전) 필요.
2. 기존 ChatGPT 예약(월 10시, 09/14 11시 일회)의 유지·중단 시점과 전환 주체. 프로젝트 예약은 기본 OFF로 둔다.
3. 텔레그램 수신 방식: 개인 chat vs 채널, opt-in UI 필요 여부, 봇 토큰 발급 시점(1단계는 토큰 없이 mock).
4. 도매 주간 기준 그룹: 법인(서울청과만 vs 두 법인), 품종 명칭("대추방울" 실제 원문 확인), 기본 등급·단위.
5. 경쟁점 30곳 초기 확보 방식: 사용자 수동 목록 vs 검증된 수집 경로. 자동 수집은 접근 경로 검증 전까지 미착수.
6. 자동 정리 정책: 현재 전역 max 동작을 사용자별로 바꿀지, 집계 이관 전까지 OFF 고정 여부.

## 6. 1단계 완료 기준 제안 (가이드 §10 구체화)

- [ ] `src/lib/briefing/rules.ts` + Zod 계약(schemaVersion·rulesVersion·statisticsVersion·observedAt UTC·KRW·검증 상태·누락 사유) 및 `docs/briefing-rules.md`.
- [ ] Prisma: `WeeklyBriefing`(userId·periodStart/End KST·version·status DRAFT/PUBLISHED·body·summary·inputSnapshot·sources), `BriefingRun`(주차+작업종류+userId unique·lease·attempts), `NotificationDelivery`(briefingId+channel+target+version unique). 개발용 마이그레이션만 작성, 운영 `db push` 금지.
- [ ] API: 목록/상세/가져오기 미리보기/반영, 세션 사용자 소유권 검사, 타인 보고서 403 테스트.
- [ ] 가져오기: Markdown 본문은 렌더 시 XSS 방지(sanitize), JSON은 버전·크기·중복키·금액·URL·시간 검증. 원문 표를 관측으로 자동 승격하지 않음.
- [ ] `src/lib/services/telegram.ts` 어댑터 + dry-run. 실제 전송 코드 경로는 `TELEGRAM_BOT_TOKEN` 부재 시 항상 no-op. mock으로 성공·429 retry_after·5xx 백오프·권한 실패 중단·타임아웃 불명 시 재전송 안 함·중복키 차단 테스트.
- [ ] 예약 등록 코드 없음(4단계). `scheduler.ts`·`instrumentation.ts`·`market-recovery*`·`backup/*` 무변경.
- [ ] `npm run typecheck`·`npm run lint`·`npm test`(현재 43개 테스트 파일)·`npm run build` 결과를 기존 실패/신규 회귀 구분해 보고. 임시 DB만 사용.
- [ ] 인계 문서에 §4 대조표 초안과 §5 결정 결과를 첨부. 원문 미제공 상태면 "이전 검증 미완"으로 명시.

## 7. 다음 단계 순서 제안

1. 사용자로부터 원문 2주분 확보 → §4 대조표 작성(코드 변경 없음).
2. 타 작업자의 recovery·백업 수정 커밋 완료 확인 후 1단계 브랜치 시작.
3. 2단계 주간 집계는 `c1c6cfe`의 DB 집계 패턴을 따르되 보관 정책(§2) 결정 뒤 착수.
