"use client";

export function CaptureExtensionHelp() {
  return <details className="rounded-lg border p-4 text-sm space-y-3">
    <summary className="cursor-pointer font-medium">브라우저 수집 도구 설치·사용</summary>
    <p>상품 페이지에서 선택한 옵션의 가격 영역을 읽어 파일이나 클립보드로 가져오는 Chrome 확장 프로그램입니다. 서버에 자동 전송하거나 가격을 자동 저장하지 않습니다.</p>
    <a className="text-primary underline underline-offset-4" href="/downloads/retirefarm-competitor-capture.zip" download>수집 도구 ZIP 다운로드</a>
    <ol className="list-decimal pl-5 space-y-1">
      <li>ZIP을 내려받아 압축을 풉니다.</li>
      <li>Chrome 주소창에 <code>chrome://extensions</code>를 입력하고 개발자 모드를 켠 뒤 ‘압축해제된 확장 프로그램을 로드합니다’에서 압축을 푼 폴더를 선택합니다.</li>
      <li>상품 페이지에서 옵션 하나·수량 1을 선택하고 확장 프로그램을 엽니다. 가격 영역을 읽지 못하면 필요한 화면 영역을 드래그해 선택한 뒤 다시 읽습니다.</li>
      <li>수집 내용을 검토하고 JSON을 복사하거나 파일로 저장합니다. 아래 고정 패널의 ‘상품 화면에서 가격 가져오기’에서 붙여넣거나 파일을 선택하세요.</li>
    </ol>
    <p className="text-muted-foreground">같은 상품 주소에서 최근 24시간 안에 수집한 자료만 가져옵니다. 선택 옵션·상품가·배송비·재고를 확인한 뒤 ‘관측 기록’으로 저장하세요. 확장은 버튼을 누른 현재 상품 탭만 읽습니다.</p>
  </details>;
}
