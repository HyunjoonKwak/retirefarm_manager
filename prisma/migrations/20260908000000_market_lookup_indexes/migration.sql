-- 품목별 품종·산지 목록 조회가 품목 전체 행을 읽지 않도록 커버링 인덱스를 추가한다.
-- 기존 자료는 바꾸지 않는다.
CREATE INDEX "AuctionResult_productName_variety_idx" ON "AuctionResult"("productName", "variety");
CREATE INDEX "AuctionResult_productName_origin_idx" ON "AuctionResult"("productName", "origin");
