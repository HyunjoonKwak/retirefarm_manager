# 2026-09-14 검색 후보 추가 검토 및 붙여넣기 개선

## 실제 확인

- 수집 파일: retirefarm-visible-search-2026-09-14T09-02-49-148Z.json (18:02:49 KST).
- 확장 1.1.1 실제 파일에서 판매 많은순, 검색어, 원본 URL, 20개 상품을 확인했다.
- 18:06 KST 정직한농장 1건을 검토 저장하고 2kg 작업 완료를 운영 UI에서 확인했다. 기존 근거를 포함해 해당 상품 근거는 2건이다.
- 18:10–18:13 KST 나머지 19개 상품 URL을 같은 네이버 탭에서 직접 열어 판매처와 상품 제목을 대조했다. 아래는 주소/제목 검증이며 옵션 가격·판매량·비광고 판정을 의미하지 않는다.

| 위치 | 판매처 | 실제 상품 URL | 추가 확인 사항 |
|---|---|---|---|
| 1 | 장보남 | https://smartstore.naver.com/jbn/products/5618807799 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 2 | 일품 자연 | https://smartstore.naver.com/salntvalentine/products/9358849046 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 3 | 삼형제토마토 | https://smartstore.naver.com/stylebooth/products/13652591670 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 4 | 대한민국농수산 | https://smartstore.naver.com/koreasusan1/products/11390668400 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 5 | 정직한농장 | https://smartstore.naver.com/honsetfarm/products/5170746418 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 6 | 행복한농부 | https://smartstore.naver.com/kiwi/products/705963752 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 7 | 달코미스토어 | https://smartstore.naver.com/dalcomi4331/products/7982770809 | 제목은 1kg. 2kg 옵션 존재 여부 확인 필요 |
| 8 | 맛꾼푸드 | https://smartstore.naver.com/mggfood/products/436415441 | 대추방울·완숙·쥬스용 혼합 제목. 옵션 분리 필요 |
| 9 | 아침마당스토리 | https://smartstore.naver.com/morning4123/products/5900633717 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 10 | 더싱싱 | https://smartstore.naver.com/thesingsingmall/products/11301751825 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 11 | 달콤마켓스토어 | https://smartstore.naver.com/imjisi/products/7037595560 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 12 | 지금땄슈 | https://smartstore.naver.com/art-8684/products/13004982974 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 13 | 전라도청년 | https://smartstore.naver.com/jeolla-youth/products/12012242193 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 14 | 오케스트라파머스 | https://smartstore.naver.com/orchestrafarmers/products/9109621004 | 유기농 방울토마토. 대추형 품종 확인 필요 |
| 15 | 제이청과 | https://smartstore.naver.com/jwfruit/products/10092149919 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 16 | 푸드맛킹 | https://smartstore.naver.com/thefarm_/products/5643485029 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 17 | 비오채 | https://smartstore.naver.com/biochae/products/13288576914 | 스테비아 상품. 일반 대추방울과 별도 비교 필요 |
| 18 | 전설의농부 | https://smartstore.naver.com/rlskf/products/12111391932 | 무농약 방울토마토. 대추형 품종 확인 필요 |
| 19 | 미리내 농수산 | https://smartstore.naver.com/dal-dal_farm/products/8978629128 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |
| 20 | 구성포냥냥파머즈 | https://smartstore.naver.com/ninecatsfarmer/products/12280882374 | 선택 옵션의 중량·크기 기준·배송비 확인 필요 |

## UI 개선

- Claude: 검색 화면 JSON 붙여넣기 → 검토 미리보기, 공통 검증, UI 테스트 구현. Codex: 실제 상품 대조, 코드 검토, 안내 문구 정리, 배포/실사용 검증.
- 붙여넣기는 검색 캡처 스키마만 허용하며 직접 저장하지 않는다. 기존 파일 가져오기와 동일한 24시간 유효성 및 연결 작업 검색어/시작 시각 검사를 사용한다.
- UTF-8 256KB 제한. 입력 수정/검증 실패 시 이전 미리보기 제거. 원본 관측 시각, 정렬, 리뷰 기준, 광고 미확인은 보존한다.
- 확장 재설치나 추가 권한 없이 기존 JSON 복사 기능을 이용할 수 있다.

## 남은 작업

- 미검토 후보를 모두 가격 비교에 포함하지 않는다. 품종·크기 수치 기준·중량·배송비가 확인된 옵션을 최소 3개 판매처에서 확보해야 대표 가격 계산이 가능하다.
- 3kg 검색 작업, 정기 브라우저 수집 워커, 주간 보고서 통합은 별도 후속 작업이다.
- 모든 후보의 광고 여부는 현재 미확인이다. 검색 목록에 광고 배지가 없다는 이유만으로 비광고로 승격하지 않는다.
