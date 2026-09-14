# Codex 브리핑 워커 v1 계약

구현용 계약. 서버는 Codex, `scripts/briefing-worker.mjs`와 워커 단위 테스트는 Claude 소유.

## HTTP

한 번 실행하는 워커: `node scripts/briefing-worker.mjs --once`. 자동 예약 설치 없음.
환경: `BRIEFING_SERVER_URL`(HTTPS, localhost만 HTTP 허용), `BRIEFING_WORKER_TOKEN_FILE`(앱에서 발급한 토큰만 들어 있는 파일), 선택 `BRIEFING_CODEX_BIN`(기본 codex).
서버 endpoint: `POST /api/briefing-worker`, Authorization Bearer worker-token, JSON. 리다이렉트 따라가지 않음. 토큰/전체 오류 응답/본문/인증 URL 로그 금지.

- `{action:"claim"}` → `{job:null}` 또는 `{job:{id,leaseToken,inputHash,snapshot,leaseUntil}}`.
- `{action:"heartbeat",jobId,leaseToken}` → `{ok:true}`. 작업 중 60초마다. 서버 lease 10분. 409/401은 실행 중단.
- `{action:"complete",jobId,leaseToken,inputHash,result,usage:{inputTokens,outputTokens,cachedInputTokens}}` → `{ok:true}`. usage 생략 가능.
- `{action:"fail",jobId,leaseToken,code}` → `{ok:true}`. code: `AUTH_REQUIRED|RATE_LIMIT|CODEX_FAILED|INVALID_OUTPUT|TIMEOUT`. 401/409 결과는 재전송하지 않음.
- 서버는 401 인증 실패, 409 lease 분실/상태 충돌, 400 유효하지 않은 요청. 모든 요청 15초 제한, 본문 최대 256KiB.

snapshot: `{schemaVersion:1,rulesVersion:"briefing-v1",statisticsVersion:"auction-unit-weighted-v1",periodStart,periodEnd,generatedAt,sources:[{id,title,url:string|null,status:"AVAILABLE"|"NOT_COLLECTED",note}],metrics:[{id,label,value:number,unit,sourceId}],limitations:string[]}`. 날짜는 UTC ISO. 가격은 같은 법인/품목/품종/산지/등급/단위 조건별 수량 가중평균이며 현재 v1은 전주만 포함한다. 가격·거래량 외 분야는 NOT_COLLECTED로 명시.

## Codex 최종 JSON (additionalProperties false, 모든 필드 required)

```
{schemaVersion:1,summary:string,
 sections:[{key:"market"|"cultivation"|"commerce"|"competitors",body:string,sourceIds:string[],metricIds:string[]}],
 actions:[{text:string,sourceIds:string[]}],limitations:string[]}
```

sections는 각 key 정확히 한 번 총4개, actions 정확히3개. summary 1~500자, body 1~3000자, action text 1~500자, limitations 항목 1~500자 최대20개. sourceIds와 metricIds는 입력에 존재하는 ID만. **summary/body/action/limitations에 아라비아 숫자를 직접 쓰지 않는다**. 수치는 서버가 검증된 metrics로 따로 렌더하므로 문장에서는 방향·의미·한계만 기술한다. 근거가 없는 분야는 미수집임을 밝히고 사실을 만들지 않는다. sourceIds 최대20, metricIds 최대100.

## 실행 격리·제한

- 기존 ChatGPT 로그인만 사용. `codex login status`가 ChatGPT 인증임을 먼저 확인하고 API 키 인증이면 claim 이전 종료.
- API 키 환경변수와 worker token을 Codex 자식 프로세스에 전달하지 않는다. 최소 env allowlist 사용.
- 전용 임시 작업 디렉터리, stdin prompt, shell:false, `exec --ignore-user-config --ignore-rules --ephemeral --sandbox read-only --skip-git-repo-check --json --output-schema ... --output-last-message ... -` 사용. 기본 프로젝트/사용자 MCP·hooks·도구가 상속되지 않도록 CLI 설정 확인. CLI가 격리 플래그 미지원이면 실패시키며 느슨한 명령으로 우회하지 않는다.
- AI에는 운영 URL·worker token·운영 DB 파일을 주지 않는다. prompt에는 snapshot만 넣고 외부 도구 사용 금지, 사실/지시 분리 명시.
- 실행 시간 최대6분, stdout/stderr 누적 크기 상한, 한 번에 작업1개. 재시도 loop 없음. 서버 실패는 안전한 code만 기록.
- complete 응답 유실이면 AI 재실행하지 않는다. 완료 요청을 로컬에 먼저 저장하고 전달 불명확 표시 후 종료한다. 다음 실행은 저장 결과를 먼저 재전송하며 새 작업은 받지 않는다. 서버는 같은 lease/input/result의 완료 재전송을 멱등 처리한다.
- 단위 테스트는 mock child process와 mock fetch로 검증하며 실제 모델 호출·예약·인증 파일 복사를 하지 않는다. 별도 수동 CLI 연결 검증은 가상 입력을 사용하고 운영 저장·발송과 분리한다.

## 늦은 완료와 로컬 복구

complete는 RUNNING 상태·같은 credential/lease/inputHash를 유지하는 동안에는 lease 시간이 지났어도 원자적으로 수락한다. heartbeat/fail은 계속 유효 시간 안에서만 허용한다. 재할당·회전·폐기·재시도로 소유권이나 상태가 바뀌면 늦은 완료는 409/401이며 저장 결과를 새 lease에 붙이지 않는다.

Mac은 토큰 파일 옆 비공개 `.state` 폴더를 사용한다. 실행 잠금, 작성 시작 체크포인트, 완료 요청 저장을 통해 불확실한 재실행을 차단한다. 같은 입력의 동시 enqueue는 기존 작업을 재사용하며 사용자별 활성 작업 상한은 트랜잭션에서 검사한다.

## 선택적 수집 확인·기간 비교

snapshot의 `analysis.version=1`은 기간별 수집 로그 확인과 동일 조건의 전주·직전 네 주 비교를 포함한다. 서버와 워커가 `scripts/briefing-analysis-schema.mjs`를 공유한다. 구버전 snapshot의 analysis 생략은 계속 허용한다. `changePct`는 비교 가능한 경우에만 제공하며 보류 상태에서 모델이 자체 계산하거나 시장 전체 추세로 일반화하지 않도록 지시한다. 상세 계산 규칙은 [기간 비교 기록](reviews/2026-09-14-briefing-comparison.md)을 따른다.

사용자 API `POST /api/briefings`의 `{action:"preview",productName,variety?,origin?}`는 snapshot만 반환하고 작업·초안을 만들지 않는다. 기존 enqueue는 같은 분석을 입력에 포함한다. 기존 초안은 변경하지 않는다.
