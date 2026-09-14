# Retirefarm 경쟁 상품 화면 캡처 확장 프로그램

네이버 스마트스토어·브랜드스토어 상품 페이지에서 **화면에 보이는 가격 텍스트**를 버튼 한 번으로 캡처해 JSON으로 내보내는 Chrome(Manifest V3) 확장 프로그램입니다. 내보낸 JSON은 Retirefarm 앱의 경쟁 상품 입력에 붙여넣어 사용합니다. 서버 통신, 자동 수집, 로그인 정보 접근은 전혀 하지 않습니다.

## 설치

1. Retirefarm 앱에서 `/downloads/retirefarm-competitor-capture.zip`을 내려받아 압축을 풉니다. (저장소에서 직접 쓰려면 `browser-extension/competitor-capture/` 폴더를 그대로 사용해도 됩니다.)
2. Chrome 주소창에 `chrome://extensions`를 입력합니다.
3. 오른쪽 위 **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 누르고 압축을 푼 폴더(`manifest.json`이 들어 있는 폴더)를 선택합니다.
5. 툴바의 퍼즐 아이콘에서 **Retirefarm 경쟁 상품 화면 캡처**를 고정하면 편합니다.

Chrome 102 이상이 필요합니다. 별도 빌드나 의존성 설치는 없습니다.

## 사용 방법

1. `https://smartstore.naver.com/<스토어>/products/<번호>` 또는 `https://brand.naver.com/<스토어>/products/<번호>` 상품 페이지를 엽니다.
2. 비교하려는 **옵션을 선택**해 총 금액이 화면에 표시되게 합니다.
3. (권장) 상품명부터 총 금액까지 가격·옵션 영역을 **마우스로 드래그 선택**합니다.
4. 툴바의 확장 아이콘을 누르고 **현재 화면 캡처** 버튼을 누릅니다.
5. 미리보기에서 제목·방식·본문을 확인한 뒤 **JSON 복사** 또는 **JSON 파일 저장**을 누릅니다.
6. Retirefarm 앱의 경쟁 상품 화면에 JSON을 붙여넣고, 앱이 보여 주는 해석 결과를 확인한 뒤 등록합니다.

드래그 선택이 없으면 확장 프로그램이 화면에서 `총 금액` 표기를 찾아 그 주변의 가격 영역만 자동으로 잡습니다. 영역을 확실히 구분할 수 없으면(전체 페이지·리뷰·계정 정보가 섞이는 경우) 캡처를 거부하므로, 그때는 3번처럼 직접 드래그 선택해 주세요.

## 내보내는 JSON 형식

```json
{
  "schemaVersion": "retirefarm-visible-product-v1",
  "productUrl": "https://smartstore.naver.com/store/products/1234567890",
  "capturedAt": "2026-09-14T03:21:45.000Z",
  "title": "상품 페이지 제목",
  "text": "화면에 보이던 텍스트 (줄바꿈 유지)",
  "method": "selection"
}
```

- `productUrl`: 현재 탭 주소에서 추적용 쿼리(`NaPm`, `utm_*` 등)와 해시를 제거한 정규 주소입니다.
- `method`: `selection`(드래그 선택 텍스트) 또는 `product-region`(총 금액 주변 자동 영역).
- 제한: `text` 30,000자, `title` 200자, JSON 전체 40,000자. 넘으면 캡처를 거부합니다.
- 숫자 해석(가격·배송비 추출)은 확장 프로그램이 하지 않고 Retirefarm 앱이 담당합니다.

## 권한과 동작 범위

- 권한은 `activeTab`, `scripting`, `clipboardWrite` 세 가지뿐입니다. 모든 사이트 접근 권한(`<all_urls>`), 호스트 권한, 백그라운드 서비스 워커, 콘텐츠 스크립트, 주기 실행이 없습니다.
- 확장 아이콘을 누른 **현재 탭에서만**, 사용자가 캡처 버튼을 누른 **그 순간에만** 페이지 텍스트를 읽습니다.
- 화면에 렌더링된 텍스트만 읽습니다. `<script>`, JSON-LD, 숨겨진 요소(`display:none`, `visibility:hidden`, `hidden` 속성), 입력창 값은 읽지 않습니다.
- 쿠키·로컬 저장소·네트워크 요청·구매·장바구니 등 페이지 상태를 바꾸는 동작은 하지 않습니다.
- 캡처 결과는 팝업 안에서만 보이며, 사용자가 복사·저장을 누르기 전에는 어디에도 남지 않습니다.

## 제한 사항

- 로그인 요구, 보안 확인(캡차), 접근 제한, 판매 중지 페이지에서는 명확히 실패 메시지를 표시하며 우회하지 않습니다.
- 지원 주소가 아닌 탭(다른 도메인, `http`, 포트·계정 정보가 포함된 주소, 스토어 메인·검색 페이지)에서는 캡처 버튼이 비활성화됩니다.
- 네이버 페이지 구조가 바뀌면 자동 영역 탐지가 실패할 수 있습니다. 이 경우에도 드래그 선택 캡처는 동작합니다.
- 팝업이 열린 상태에서 페이지가 새로 고쳐지면 팝업을 닫고 다시 여세요.
- 실제 Chrome에서의 동작은 개발자 모드로 직접 로드해 확인해야 합니다. 자동화 테스트는 추출 로직과 패키징만 검증합니다.

## 개발

- `capture.js`: 페이지에 주입되는 추출 함수 `captureVisibleProduct`와 주소 정규화·JSON 봉투 생성 함수. 추출 함수는 `chrome.scripting.executeScript({ func })`로 그대로 직렬화되므로 외부 참조 없이 자체 완결되어야 합니다.
- `popup.js` / `popup.html` / `popup.css`: 팝업 UI.
- 테스트: 저장소 루트에서 `npx vitest run src/__tests__/briefing/competitor-extension.test.ts`
- 배포용 ZIP 생성: `node scripts/package-competitor-extension.mjs` → `public/downloads/retirefarm-competitor-capture.zip` (같은 소스면 항상 같은 바이트가 나옵니다.)
