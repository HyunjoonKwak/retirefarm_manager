# retirefarm_manager 재설계 플랜 (Asset Hub Integration §6 / §8-6)

> 원본 설계: `my_portal/docs/ASSET_HUB_INTEGRATION.md` §6.
> 이 문서는 retirefarm 쪽 실행 플랜과 진행 상태를 기록한다.

## 지배 원칙 (§1.5 요약)

자산 카테고리마다 원장 소유자는 정확히 하나(SSOT)이고 쓰기 경로도 소유자에게만
있다(single writer). retirefarm은 **읽기 전용 소비자** — 자산 수동 입력 필드를
만들지 않는다. 값이 틀렸으면 소유 서비스(portfolio_manager / asset_manager)에서
고치고, 고친 결과가 스냅샷으로 흘러온다.

## Phase 1 — 자산 허브 계약 정렬 ✅ 완료 2026-08-20

- [x] **스냅샷 소비자 (§2)**: `lib/api/asset-hub-snapshot.ts`(§2.2 계약 zod 검증,
  source 명의 확인) + `lib/services/external-snapshot.ts`(수집·합산·48h 스테일) +
  `ExternalAssetSnapshot` 캐시 테이블(last-known-good — 수집 실패가 0으로 잡혀
  합산이 출렁이면 안 됨). API: `GET/POST /api/assets/snapshot-summary` (POST=수동 갱신).
- [x] **자본 준비 게이지 (§6)**: `/api/plan`이 `capitalReadiness`(스냅샷 합산 vs
  목표 자본 = 순설립비 + 생활비 버퍼, targetDate) 반환.
  `CapitalReadinessGauge`가 plan 대시보드에서 소스별 breakdown·스테일 뱃지·수동
  갱신 렌더링.
- [x] **매도 시뮬 이관 마무리 (§1.5.3-3)**: 로컬 `capital-gains-tax.ts`(asset 원본의
  단순화 복사본)·`sale-simulator.ts`(asset으로 이관 완료본)·양도세 계산기
  라우트/컴포넌트 삭제. `/api/assets/sale-simulator`는 asset_manager
  `POST /api/simulations/sale` 프록시로 대체 (스냅샷 토큰 인증, 원장 자동 로드).
  SaleSimulator UI는 원장 물건 선택+희망가 override 방식으로 재작성.
- [x] **RealEstateAsset 고아 모델 제거**: 프로덕션 0건 확인 후 드롭.
  `FundingSource.linkedAssetId`(FK) → `externalAssetId`(asset_manager Portfolio id,
  FK 없음). 연간 리포트 자산 섹션은 asset_manager 요약으로 교체.
  (기존 코드는 selectedAssetId를 API가 무시해 물건 연결이 저장된 적 없음 — 이제 저장됨)
- [x] 마이그레이션: `20260820004144_asset_hub_phase1_snapshot_consumer`

### 운영 반영 필요 (배포 시)

- NAS `.env`에 추가: `ASSET_MANAGER_URL`, `ASSET_MANAGER_SNAPSHOT_TOKEN`,
  `PORTFOLIO_MANAGER_URL`, `PORTFOLIO_MANAGER_SNAPSHOT_TOKEN`,
  `NEXT_PUBLIC_ASSET_MANAGER_URL`
- 토큰 발급: asset_manager `scripts/issue-snapshot-token.ts`,
  portfolio_manager `backend/scripts/issue_snapshot_token.py` (retirefarm 명의 신규 발급)
- retirefarm 컨테이너가 두 서비스에 도달 가능한지 확인 (같은 NAS — 네트워크/도메인)

## Phase 2 — 작기(作期) 캘린더 + 온보딩 마법사 ✅ 완료 2026-08-20

- [x] **작기 캘린더**: ssampin의 학기+컬러 라벨 구조 패턴 차용 (코드 복사 없음).
  `lib/utils/crop-calendar.ts`(순수 로직: 월 행렬·색 배정·작기 판정·이벤트, 테스트 9건) +
  `CropCalendar`(월간 그리드에 작기 컬러 막대·범례 D-day·이번 달 파종/수확 일정).
  /farm/crops 페이지를 캘린더/목록 탭으로 재구성. 데이터는 기존 `/api/farm/crops` 재사용.
- [x] **온보딩 마법사**: `FarmProfile` 모델(지역·재배형태·면적·목표연도·plannedCrops JSON)
  + `/api/onboarding`(GET 프리필/POST 저장). 3단계 마법사(`OnboardingWizard`,
  /onboarding) — 완료 시 예정 작물 중 가락시장 수집 품목을 `ProductWatchlist`에
  자동 등록 (비수집 품목은 안내 후 제외). 대시보드에 프로필 미설정 시 유도 배너
  (강제 리다이렉트 없음 — 기존 사용자 흐름 보존).
  **Crop 행은 만들지 않는다** — 예정 단계엔 날짜가 없으므로 실제 파종 시 작물 관리에서 등록.
- 마이그레이션: `20260820012409_farm_profile_onboarding` (추가만, 파괴 없음)

## Phase 3 — 운영일지 BlockNote 전환 ✅ 완료 2026-08-20

- [x] `@blocknote/shadcn`(0.54, MPL-2.0 계열 의존성 — 사용 OK, 프로젝트 shadcn 스택과 일치) 도입.
- [x] `FarmingLog.content` 컬럼(BlockNote 문서 JSON) + 생성/수정 API zod 검증
  (`blockNoteContentSchema`: 최상위 배열 JSON·200KB 상한).
- [x] `FarmingLogEditor`(ko 로케일·다크모드 연동·SSR 제외 dynamic import),
  작성 다이얼로그 본문 에디터, 카드 평문 미리보기 + 읽기 전용 열람 다이얼로그.
- [x] `blockNoteToPlainText` 재귀 추출 유틸 (미리보기·HWPX 출력 공용).
- 기존 폼 기반 활동 기록(FarmActivity)은 구조화 데이터로 병행 유지 (HWPX·통계 원천).
- 마이그레이션: `20260820013243_farming_log_blocknote_content` (추가만)

## Phase 4 — 영농일지 HWP 출력 ✅ 완료 2026-08-20 (지원서류는 잔여)

- [x] `@ubermensch1218/hwpxcore`(MIT, 0.1.3) — Skeleton.hwpx 주입 방식.
  next.config `serverExternalPackages` 등록 필수 (번들 인라인 시 자산 경로 깨짐),
  스켈레톤은 `createRequire`로 패키지 엔트리를 해석해 직접 로드
  (라이브러리 `loadSkeletonHwpx`는 ESM 로더에서 Node 분기 미동작).
- [x] `GET /api/farm/logs/export?month=YYYY-MM` — 월간 일지·활동·본문(평문)을
  제목+농장 정보+작업 내역 표(일자/날씨/기온/구분/내용)로 생성. 일지 목록에 HWPX 버튼.
- [x] 테스트: 행 구성 순수 함수 + 실제 ZIP 바이너리 생성 스모크 (`@vitest-environment node`).
- [ ] **지원서류 서식** (농업경영체 등록·보조사업 신청 등): 실서식 확정을 사용자와
  협의 후 별도 작업 — 서식 원본 HWPX를 템플릿으로 넣고 필드 주입하는 구조 권장.

## Phase 5 — 작물 시세 KAMIS 검토 (§9 열린 질문)

- KAMIS OpenAPI 커버리지 확인 (재배 예정 작물 기준) — 가락시장 경락가(도매)와
  KAMIS(도매+소매 조사가)의 보완 관계 정리.
- 커버리지 확인 후: 기존 가락시장 스케줄러 구조 재사용해 KAMIS 수집기 추가 여부 결정.
- 결정 전까지 가락시장 파이프라인 유지.

## 이 세션에서 내린 결정

1. **레거시 per-item API(`/api/portfolio/service`) 유지**: §2 스냅샷은 집계 전용이라
   자금 유입 계획(물건별 매도 예정·순수익)에는 물건 단위 조회가 필요하다.
   읽기 전용이므로 지배 원칙 위반 아님. 집계는 스냅샷, 물건 상세는 레거시 API로 역할 분리.
2. **my_portal 현금은 게이지 합산에서 제외 (v1)**: my_portal은 §2 제공자 엔드포인트가
   없다 (수집기만 보유). 필요해지면 my_portal에 provider 구현을 요청하는 별도 과제
   (ASSET_HUB_INTEGRATION.md §9에 추가 후보).
3. **스냅샷 캐시는 전역(사용자 무관)**: 가족 단일 가구 사용 전제. 서비스 토큰이
   제공 서비스 쪽 특정 사용자에 귀속되므로 retirefarm 사용자별 분리는 무의미.
