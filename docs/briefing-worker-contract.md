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
- complete 응답 유실이면 AI 재실행하지 않는다. 실패를 덮어쓰지 말고 결과 전달 불명확 표시 후 종료. 서버는 같은 lease/input/result의 완료 재전송을 멱등 처리한다.
- 단위 테스트는 mock child process와 mock fetch로 검증하며 실제 모델 호출·예약·인증 파일 복사를 하지 않는다. 별도 수동 CLI 연결 검증은 가상 입력을 사용하고 운영 저장·발송과 분리한다.
