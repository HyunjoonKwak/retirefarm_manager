/**
 * PostgreSQL → SQLite 데이터 마이그레이션 스크립트
 *
 * 사용법:
 * 1. POSTGRES_URL 환경변수 설정
 *    POSTGRES_URL="postgresql://postgres:password@localhost:5432/retirefarm"
 *
 * 2. 스크립트 실행
 *    npx tsx scripts/migrate-pg-to-sqlite.ts
 */

import Database from "better-sqlite3";
import pg from "pg";

// PostgreSQL 연결 (기존 데이터)
const POSTGRES_URL =
  process.env.POSTGRES_URL ||
  "postgresql://postgres:password@localhost:5432/retirefarm";

// SQLite 파일 경로 (Docker 컨테이너 내부 또는 로컬)
const SQLITE_PATH =
  process.env.SQLITE_PATH || "/app/prisma/data/retirefarm.db";

// PostgreSQL 클라이언트 (pg 라이브러리 직접 사용)
const pgPool = new pg.Pool({
  connectionString: POSTGRES_URL,
});

// SQLite 직접 연결 (better-sqlite3)
const sqlite = new Database(SQLITE_PATH);

// 로깅 유틸리티
const log = {
  info: (msg: string) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warning: (msg: string) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
  error: (msg: string) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  progress: (current: number, total: number, label: string) => {
    const percent = Math.round((current / total) * 100);
    process.stdout.write(`\r  ${label}: ${current}/${total} (${percent}%)`);
    if (current === total) console.log("");
  },
};

// DateTime을 SQLite 형식으로 변환
function formatDateTime(date: Date | string | null): string | null {
  if (!date) return null;
  if (typeof date === "string") return new Date(date).toISOString();
  return date.toISOString();
}

// Decimal을 문자열로 변환
function formatDecimal(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

// Boolean을 SQLite 정수로 변환
function formatBoolean(value: boolean | null): number {
  return value ? 1 : 0;
}

// PostgreSQL 테이블 존재 여부 확인
async function tableExists(tableName: string): Promise<boolean> {
  const { rows } = await pgPool.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
    [tableName]
  );
  return rows[0].exists;
}

// ==================== User ====================
async function migrateUsers() {
  log.info("사용자(User) 마이그레이션 중...");

  const { rows: users } = await pgPool.query('SELECT * FROM "User"');

  if (users.length === 0) {
    log.warning("마이그레이션할 사용자가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO User (id, email, name, password, createdAt, updatedAt, isSsoUser, portalEmail, ssoEnabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    stmt.run(
      u.id,
      u.email,
      u.name,
      u.password,
      formatDateTime(u.createdAt),
      formatDateTime(u.updatedAt),
      formatBoolean(u.isSsoUser),
      u.portalEmail,
      formatBoolean(u.ssoEnabled)
    );
    log.progress(i + 1, users.length, "User");
  }

  log.success(`사용자 ${users.length}건 마이그레이션 완료`);
}

// ==================== RetirementGoal ====================
async function migrateRetirementGoals() {
  log.info("퇴직 목표(RetirementGoal) 마이그레이션 중...");

  const { rows } = await pgPool.query('SELECT * FROM "RetirementGoal"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 퇴직 목표가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO RetirementGoal (
      id, userId, targetDate, estimatedRetirementPay, estimatedSeverancePay,
      initialLivingBuffer, bufferMonths, monthlyLivingExpense, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    stmt.run(
      r.id,
      r.userId,
      formatDateTime(r.targetDate),
      formatDecimal(r.estimatedRetirementPay),
      formatDecimal(r.estimatedSeverancePay),
      formatDecimal(r.initialLivingBuffer),
      r.bufferMonths,
      formatDecimal(r.monthlyLivingExpense),
      formatDateTime(r.createdAt),
      formatDateTime(r.updatedAt)
    );
    log.progress(i + 1, rows.length, "RetirementGoal");
  }

  log.success(`퇴직 목표 ${rows.length}건 마이그레이션 완료`);
}

// ==================== RealEstateAsset ====================
async function migrateRealEstateAssets() {
  log.info("부동산 자산(RealEstateAsset) 마이그레이션 중...");

  if (!(await tableExists("RealEstateAsset"))) {
    log.warning("RealEstateAsset 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "RealEstateAsset"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 부동산 자산이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO RealEstateAsset (
      id, userId, name, propertyType, address, area, acquisitionDate, acquisitionPrice,
      currentPrice, expectedSalePrice, mortgageBalance, monthlyRent, status,
      plannedSaleDate, notes, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    stmt.run(
      r.id,
      r.userId,
      r.name,
      r.propertyType,
      r.address,
      formatDecimal(r.area),
      formatDateTime(r.acquisitionDate),
      formatDecimal(r.acquisitionPrice),
      formatDecimal(r.currentPrice),
      formatDecimal(r.expectedSalePrice),
      formatDecimal(r.mortgageBalance),
      formatDecimal(r.monthlyRent),
      r.status,
      formatDateTime(r.plannedSaleDate),
      r.notes,
      formatDateTime(r.createdAt),
      formatDateTime(r.updatedAt)
    );
    log.progress(i + 1, rows.length, "RealEstateAsset");
  }

  log.success(`부동산 자산 ${rows.length}건 마이그레이션 완료`);
}

// ==================== SetupCostCategory ====================
async function migrateSetupCostCategories() {
  log.info("설립 비용 카테고리(SetupCostCategory) 마이그레이션 중...");

  if (!(await tableExists("SetupCostCategory"))) {
    log.warning("SetupCostCategory 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "SetupCostCategory"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 설립 비용 카테고리가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO SetupCostCategory (id, name, "order")
    VALUES (?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    stmt.run(c.id, c.name, c.order);
    log.progress(i + 1, rows.length, "SetupCostCategory");
  }

  log.success(`설립 비용 카테고리 ${rows.length}건 마이그레이션 완료`);
}

// ==================== SetupCostSubcategory ====================
async function migrateSetupCostSubcategories() {
  log.info("설립 비용 서브카테고리(SetupCostSubcategory) 마이그레이션 중...");

  if (!(await tableExists("SetupCostSubcategory"))) {
    log.warning("SetupCostSubcategory 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "SetupCostSubcategory"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 설립 비용 서브카테고리가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO SetupCostSubcategory (id, categoryId, name, "order")
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    stmt.run(s.id, s.categoryId, s.name, s.order);
    log.progress(i + 1, rows.length, "SetupCostSubcategory");
  }

  log.success(`설립 비용 서브카테고리 ${rows.length}건 마이그레이션 완료`);
}

// ==================== SetupCostItem ====================
async function migrateSetupCostItems() {
  log.info("설립 비용 항목(SetupCostItem) 마이그레이션 중...");

  if (!(await tableExists("SetupCostItem"))) {
    log.warning("SetupCostItem 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "SetupCostItem"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 설립 비용 항목이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO SetupCostItem (
      id, userId, subcategoryId, name, description, estimatedCost, actualCost,
      quantity, unit, isGovernmentSubsidy, subsidyAmount, subsidyRate, priority,
      status, notes, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    stmt.run(
      item.id,
      item.userId,
      item.subcategoryId,
      item.name,
      item.description,
      formatDecimal(item.estimatedCost),
      formatDecimal(item.actualCost),
      item.quantity,
      item.unit,
      formatBoolean(item.isGovernmentSubsidy),
      formatDecimal(item.subsidyAmount),
      formatDecimal(item.subsidyRate),
      item.priority,
      item.status,
      item.notes,
      formatDateTime(item.createdAt),
      formatDateTime(item.updatedAt)
    );
    log.progress(i + 1, rows.length, "SetupCostItem");
  }

  log.success(`설립 비용 항목 ${rows.length}건 마이그레이션 완료`);
}

// ==================== FundingSource ====================
async function migrateFundingSources() {
  log.info("자금조달(FundingSource) 마이그레이션 중...");

  if (!(await tableExists("FundingSource"))) {
    log.warning("FundingSource 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "FundingSource"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 자금조달이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO FundingSource (
      id, userId, type, name, amount, expectedDate, linkedAssetId, status,
      notes, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    stmt.run(
      f.id,
      f.userId,
      f.type,
      f.name,
      formatDecimal(f.amount),
      formatDateTime(f.expectedDate),
      f.linkedAssetId,
      f.status,
      f.notes,
      formatDateTime(f.createdAt),
      formatDateTime(f.updatedAt)
    );
    log.progress(i + 1, rows.length, "FundingSource");
  }

  log.success(`자금조달 ${rows.length}건 마이그레이션 완료`);
}

// ==================== FarmingLog ====================
async function migrateFarmingLogs() {
  log.info("영농일지(FarmingLog) 마이그레이션 중...");

  if (!(await tableExists("FarmingLog"))) {
    log.warning("FarmingLog 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "FarmingLog"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 영농일지가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO FarmingLog (
      id, userId, date, temperature, humidity, rainfall, weather, notes, photos,
      createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const l = rows[i];
    // photos 필드: PostgreSQL에서 배열일 수 있음 -> JSON 문자열로 변환
    let photos = l.photos;
    if (Array.isArray(photos)) {
      photos = JSON.stringify(photos);
    }
    stmt.run(
      l.id,
      l.userId,
      formatDateTime(l.date),
      formatDecimal(l.temperature),
      l.humidity,
      formatDecimal(l.rainfall),
      l.weather,
      l.notes,
      photos,
      formatDateTime(l.createdAt),
      formatDateTime(l.updatedAt)
    );
    log.progress(i + 1, rows.length, "FarmingLog");
  }

  log.success(`영농일지 ${rows.length}건 마이그레이션 완료`);
}

// ==================== FarmActivity ====================
async function migrateFarmActivities() {
  log.info("영농활동(FarmActivity) 마이그레이션 중...");

  if (!(await tableExists("FarmActivity"))) {
    log.warning("FarmActivity 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "FarmActivity"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 영농활동이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO FarmActivity (
      id, logId, type, cropId, plotId, description, quantity, unit, duration, workers, createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    stmt.run(
      a.id,
      a.logId,
      a.type,
      a.cropId,
      a.plotId,
      a.description,
      formatDecimal(a.quantity),
      a.unit,
      a.duration,
      a.workers,
      formatDateTime(a.createdAt)
    );
    log.progress(i + 1, rows.length, "FarmActivity");
  }

  log.success(`영농활동 ${rows.length}건 마이그레이션 완료`);
}

// ==================== MaterialUsage ====================
async function migrateMaterialUsages() {
  log.info("자재사용(MaterialUsage) 마이그레이션 중...");

  if (!(await tableExists("MaterialUsage"))) {
    log.warning("MaterialUsage 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "MaterialUsage"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 자재사용이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO MaterialUsage (id, activityId, itemId, quantity)
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    stmt.run(m.id, m.activityId, m.itemId, formatDecimal(m.quantity));
    log.progress(i + 1, rows.length, "MaterialUsage");
  }

  log.success(`자재사용 ${rows.length}건 마이그레이션 완료`);
}

// ==================== Crop ====================
async function migrateCrops() {
  log.info("작물(Crop) 마이그레이션 중...");

  if (!(await tableExists("Crop"))) {
    log.warning("Crop 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "Crop"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 작물이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO Crop (
      id, userId, name, variety, plantingDate, expectedHarvestDate, plotId,
      status, growthStage, notes, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    stmt.run(
      c.id,
      c.userId,
      c.name,
      c.variety,
      formatDateTime(c.plantingDate),
      formatDateTime(c.expectedHarvestDate),
      c.plotId,
      c.status,
      c.growthStage,
      c.notes,
      formatDateTime(c.createdAt),
      formatDateTime(c.updatedAt)
    );
    log.progress(i + 1, rows.length, "Crop");
  }

  log.success(`작물 ${rows.length}건 마이그레이션 완료`);
}

// ==================== FinancialTransaction ====================
async function migrateFinancialTransactions() {
  log.info("재무 거래(FinancialTransaction) 마이그레이션 중...");

  if (!(await tableExists("FinancialTransaction"))) {
    log.warning("FinancialTransaction 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "FinancialTransaction"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 재무 거래가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO FinancialTransaction (
      id, userId, date, type, category, subcategory, amount, description,
      relatedCropId, paymentMethod, receiptUrl, createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const t = rows[i];
    stmt.run(
      t.id,
      t.userId,
      formatDateTime(t.date),
      t.type,
      t.category,
      t.subcategory,
      formatDecimal(t.amount),
      t.description,
      t.relatedCropId,
      t.paymentMethod,
      t.receiptUrl,
      formatDateTime(t.createdAt)
    );
    log.progress(i + 1, rows.length, "FinancialTransaction");
  }

  log.success(`재무 거래 ${rows.length}건 마이그레이션 완료`);
}

// ==================== InventoryItem ====================
async function migrateInventoryItems() {
  log.info("재고 항목(InventoryItem) 마이그레이션 중...");

  if (!(await tableExists("InventoryItem"))) {
    log.warning("InventoryItem 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "InventoryItem"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 재고 항목이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO InventoryItem (
      id, userId, name, category, currentQuantity, unit, minimumQuantity,
      lastPurchaseDate, lastPurchasePrice, location, expirationDate, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    stmt.run(
      item.id,
      item.userId,
      item.name,
      item.category,
      formatDecimal(item.currentQuantity),
      item.unit,
      formatDecimal(item.minimumQuantity),
      formatDateTime(item.lastPurchaseDate),
      formatDecimal(item.lastPurchasePrice),
      item.location,
      formatDateTime(item.expirationDate),
      formatDateTime(item.createdAt),
      formatDateTime(item.updatedAt)
    );
    log.progress(i + 1, rows.length, "InventoryItem");
  }

  log.success(`재고 항목 ${rows.length}건 마이그레이션 완료`);
}

// ==================== InventoryTransaction ====================
async function migrateInventoryTransactions() {
  log.info("재고 거래(InventoryTransaction) 마이그레이션 중...");

  if (!(await tableExists("InventoryTransaction"))) {
    log.warning("InventoryTransaction 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "InventoryTransaction"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 재고 거래가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO InventoryTransaction (id, itemId, type, quantity, date, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const t = rows[i];
    stmt.run(
      t.id,
      t.itemId,
      t.type,
      formatDecimal(t.quantity),
      formatDateTime(t.date),
      t.reason
    );
    log.progress(i + 1, rows.length, "InventoryTransaction");
  }

  log.success(`재고 거래 ${rows.length}건 마이그레이션 완료`);
}

// ==================== PriceWatchlist ====================
async function migratePriceWatchlists() {
  log.info("시세 관심목록(PriceWatchlist) 마이그레이션 중...");

  if (!(await tableExists("PriceWatchlist"))) {
    log.warning("PriceWatchlist 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "PriceWatchlist"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 시세 관심목록이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO PriceWatchlist (id, userId, itemCode, itemName)
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const w = rows[i];
    stmt.run(w.id, w.userId, w.itemCode, w.itemName);
    log.progress(i + 1, rows.length, "PriceWatchlist");
  }

  log.success(`시세 관심목록 ${rows.length}건 마이그레이션 완료`);
}

// ==================== PriceAlert ====================
async function migratePriceAlerts() {
  log.info("시세 알림(PriceAlert) 마이그레이션 중...");

  if (!(await tableExists("PriceAlert"))) {
    log.warning("PriceAlert 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "PriceAlert"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 시세 알림이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO PriceAlert (id, userId, itemCode, itemName, condition, targetPrice, isActive)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    stmt.run(
      a.id,
      a.userId,
      a.itemCode,
      a.itemName,
      a.condition,
      formatDecimal(a.targetPrice),
      formatBoolean(a.isActive)
    );
    log.progress(i + 1, rows.length, "PriceAlert");
  }

  log.success(`시세 알림 ${rows.length}건 마이그레이션 완료`);
}

// ==================== MarketPriceCache ====================
async function migrateMarketPriceCache() {
  log.info("시세 캐시(MarketPriceCache) 마이그레이션 중...");

  if (!(await tableExists("MarketPriceCache"))) {
    log.warning("MarketPriceCache 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "MarketPriceCache"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 시세 캐시가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO MarketPriceCache (
      id, itemCode, itemName, marketCode, marketName, date, avgPrice,
      maxPrice, minPrice, tradingVolume, unit, fetchedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    stmt.run(
      m.id,
      m.itemCode,
      m.itemName,
      m.marketCode,
      m.marketName,
      formatDateTime(m.date),
      formatDecimal(m.avgPrice),
      formatDecimal(m.maxPrice),
      formatDecimal(m.minPrice),
      formatDecimal(m.tradingVolume),
      m.unit,
      formatDateTime(m.fetchedAt)
    );
    log.progress(i + 1, rows.length, "MarketPriceCache");
  }

  log.success(`시세 캐시 ${rows.length}건 마이그레이션 완료`);
}

// ==================== Notification ====================
async function migrateNotifications() {
  log.info("알림(Notification) 마이그레이션 중...");

  if (!(await tableExists("Notification"))) {
    log.warning("Notification 테이블이 없습니다. 건너뜁니다.");
    return;
  }

  const { rows } = await pgPool.query('SELECT * FROM "Notification"');

  if (rows.length === 0) {
    log.warning("마이그레이션할 알림이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO Notification (id, userId, type, title, message, link, isRead, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const n = rows[i];
    stmt.run(
      n.id,
      n.userId,
      n.type,
      n.title,
      n.message,
      n.link,
      formatBoolean(n.isRead),
      formatDateTime(n.createdAt)
    );
    log.progress(i + 1, rows.length, "Notification");
  }

  log.success(`알림 ${rows.length}건 마이그레이션 완료`);
}

async function main() {
  console.log("\n==========================================");
  console.log("  PostgreSQL → SQLite 데이터 마이그레이션");
  console.log("==========================================\n");

  log.info(`PostgreSQL URL: ${POSTGRES_URL.replace(/:[^:@]+@/, ":****@")}`);
  log.info(`SQLite 파일: ${SQLITE_PATH}`);

  let transactionStarted = false;

  try {
    // PostgreSQL 연결 테스트
    log.info("PostgreSQL 연결 테스트 중...");
    await pgPool.query("SELECT 1");
    log.success("PostgreSQL 연결 성공!");

    // 트랜잭션으로 마이그레이션 실행
    sqlite.exec("BEGIN TRANSACTION");
    transactionStarted = true;

    // 순서대로 마이그레이션 (외래 키 의존성 고려)
    await migrateUsers();
    await migrateRetirementGoals();
    await migrateRealEstateAssets();
    await migrateSetupCostCategories();
    await migrateSetupCostSubcategories();
    await migrateSetupCostItems();
    await migrateFundingSources();
    await migrateFarmingLogs();
    await migrateCrops();
    await migrateFarmActivities();
    await migrateMaterialUsages();
    await migrateFinancialTransactions();
    await migrateInventoryItems();
    await migrateInventoryTransactions();
    await migratePriceWatchlists();
    await migratePriceAlerts();
    await migrateMarketPriceCache();
    await migrateNotifications();

    sqlite.exec("COMMIT");
    transactionStarted = false;

    console.log("\n==========================================");
    log.success("모든 데이터 마이그레이션이 완료되었습니다!");
    console.log("==========================================\n");
  } catch (error) {
    if (transactionStarted) {
      try {
        sqlite.exec("ROLLBACK");
      } catch {
        // ignore rollback error
      }
    }
    log.error("마이그레이션 중 오류 발생:");
    console.error(error);
    process.exit(1);
  } finally {
    await pgPool.end();
    sqlite.close();
  }
}

main();
