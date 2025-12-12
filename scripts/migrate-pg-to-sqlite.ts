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
function formatDecimal(value: any): string | null {
  if (value === null || value === undefined) return null;
  return value.toString();
}

// Boolean을 SQLite 정수로 변환
function formatBoolean(value: boolean | null): number {
  return value ? 1 : 0;
}

async function migrateUsers() {
  log.info("사용자(User) 마이그레이션 중...");

  const { rows: users } = await pgPool.query("SELECT * FROM \"User\"");

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

async function migrateRetirementGoals() {
  log.info("퇴직 목표(RetirementGoal) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"RetirementGoal\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 퇴직 목표가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO RetirementGoal (id, userId, targetDate, targetAge, monthlyExpense, inflationRate,
      currentSavings, currentInvestments, expectedPension, expectedSocialSecurity,
      createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    stmt.run(
      r.id,
      r.userId,
      formatDateTime(r.targetDate),
      r.targetAge,
      formatDecimal(r.monthlyExpense),
      formatDecimal(r.inflationRate),
      formatDecimal(r.currentSavings),
      formatDecimal(r.currentInvestments),
      formatDecimal(r.expectedPension),
      formatDecimal(r.expectedSocialSecurity),
      formatDateTime(r.createdAt),
      formatDateTime(r.updatedAt)
    );
    log.progress(i + 1, rows.length, "RetirementGoal");
  }

  log.success(`퇴직 목표 ${rows.length}건 마이그레이션 완료`);
}

async function migrateAssets() {
  log.info("자산(Asset) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"Asset\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 자산이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO Asset (id, userId, name, type, category, currentValue, purchaseValue,
      purchaseDate, location, description, isLiquid, expectedReturn, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    stmt.run(
      a.id,
      a.userId,
      a.name,
      a.type, // Enum → String
      a.category,
      formatDecimal(a.currentValue),
      formatDecimal(a.purchaseValue),
      formatDateTime(a.purchaseDate),
      a.location,
      a.description,
      formatBoolean(a.isLiquid),
      formatDecimal(a.expectedReturn),
      a.status, // Enum → String
      formatDateTime(a.createdAt),
      formatDateTime(a.updatedAt)
    );
    log.progress(i + 1, rows.length, "Asset");
  }

  log.success(`자산 ${rows.length}건 마이그레이션 완료`);
}

async function migrateRealEstates() {
  log.info("부동산(RealEstate) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"RealEstate\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 부동산이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO RealEstate (id, assetId, propertyType, address, area, acquisitionTax,
      propertyTax, maintenanceCost, rentalIncome, mortgageBalance, mortgageRate, mortgageEndDate, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    stmt.run(
      r.id,
      r.assetId,
      r.propertyType, // Enum → String
      r.address,
      formatDecimal(r.area),
      formatDecimal(r.acquisitionTax),
      formatDecimal(r.propertyTax),
      formatDecimal(r.maintenanceCost),
      formatDecimal(r.rentalIncome),
      formatDecimal(r.mortgageBalance),
      formatDecimal(r.mortgageRate),
      formatDateTime(r.mortgageEndDate),
      formatDateTime(r.createdAt),
      formatDateTime(r.updatedAt)
    );
    log.progress(i + 1, rows.length, "RealEstate");
  }

  log.success(`부동산 ${rows.length}건 마이그레이션 완료`);
}

async function migrateFinancialAssets() {
  log.info("금융자산(FinancialAsset) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"FinancialAsset\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 금융자산이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO FinancialAsset (id, assetId, financialType, institution, accountNumber,
      interestRate, maturityDate, taxBenefit, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    stmt.run(
      f.id,
      f.assetId,
      f.financialType, // Enum → String
      f.institution,
      f.accountNumber,
      formatDecimal(f.interestRate),
      formatDateTime(f.maturityDate),
      f.taxBenefit,
      formatDateTime(f.createdAt),
      formatDateTime(f.updatedAt)
    );
    log.progress(i + 1, rows.length, "FinancialAsset");
  }

  log.success(`금융자산 ${rows.length}건 마이그레이션 완료`);
}

async function migrateFundingSources() {
  log.info("자금조달(FundingSource) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"FundingSource\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 자금조달이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO FundingSource (id, userId, name, type, amount, expectedDate, status,
      linkedAssetId, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    stmt.run(
      f.id,
      f.userId,
      f.name,
      f.type, // Enum → String
      formatDecimal(f.amount),
      formatDateTime(f.expectedDate),
      f.status, // Enum → String
      f.linkedAssetId,
      f.notes,
      formatDateTime(f.createdAt),
      formatDateTime(f.updatedAt)
    );
    log.progress(i + 1, rows.length, "FundingSource");
  }

  log.success(`자금조달 ${rows.length}건 마이그레이션 완료`);
}

async function migrateSetupCategories() {
  log.info("설정 카테고리(SetupCategory) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"SetupCategory\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 설정 카테고리가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO SetupCategory (id, userId, name, type, description, sortOrder, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    stmt.run(
      c.id,
      c.userId,
      c.name,
      c.type, // Enum → String
      c.description,
      c.sortOrder,
      formatDateTime(c.createdAt),
      formatDateTime(c.updatedAt)
    );
    log.progress(i + 1, rows.length, "SetupCategory");
  }

  log.success(`설정 카테고리 ${rows.length}건 마이그레이션 완료`);
}

async function migrateSetupItems() {
  log.info("설정 항목(SetupItem) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"SetupItem\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 설정 항목이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO SetupItem (id, categoryId, name, brand, quantity, unit, estimatedCost,
      actualCost, priority, status, purchaseUrl, notes, purchaseDate, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    stmt.run(
      item.id,
      item.categoryId,
      item.name,
      item.brand,
      item.quantity,
      item.unit,
      formatDecimal(item.estimatedCost),
      formatDecimal(item.actualCost),
      item.priority, // Enum → String
      item.status, // Enum → String
      item.purchaseUrl,
      item.notes,
      formatDateTime(item.purchaseDate),
      formatDateTime(item.createdAt),
      formatDateTime(item.updatedAt)
    );
    log.progress(i + 1, rows.length, "SetupItem");
  }

  log.success(`설정 항목 ${rows.length}건 마이그레이션 완료`);
}

async function migrateLandParcels() {
  log.info("토지(LandParcel) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"LandParcel\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 토지가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO LandParcel (id, userId, name, address, totalArea, usableArea,
      landCategory, zoning, waterAccess, electricityAccess, roadAccess, soilQuality,
      slope, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const l = rows[i];
    stmt.run(
      l.id,
      l.userId,
      l.name,
      l.address,
      formatDecimal(l.totalArea),
      formatDecimal(l.usableArea),
      l.landCategory,
      l.zoning,
      formatBoolean(l.waterAccess),
      formatBoolean(l.electricityAccess),
      l.roadAccess,
      l.soilQuality,
      l.slope,
      l.notes,
      formatDateTime(l.createdAt),
      formatDateTime(l.updatedAt)
    );
    log.progress(i + 1, rows.length, "LandParcel");
  }

  log.success(`토지 ${rows.length}건 마이그레이션 완료`);
}

async function migratePlots() {
  log.info("구획(Plot) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"Plot\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 구획이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO Plot (id, landParcelId, name, area, soilType, sunExposure,
      irrigationType, currentUse, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    stmt.run(
      p.id,
      p.landParcelId,
      p.name,
      formatDecimal(p.area),
      p.soilType,
      p.sunExposure,
      p.irrigationType,
      p.currentUse,
      p.notes,
      formatDateTime(p.createdAt),
      formatDateTime(p.updatedAt)
    );
    log.progress(i + 1, rows.length, "Plot");
  }

  log.success(`구획 ${rows.length}건 마이그레이션 완료`);
}

async function migrateCrops() {
  log.info("작물(Crop) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"Crop\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 작물이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO Crop (id, userId, name, variety, category, plantingDate, harvestDate,
      growingPeriod, status, expectedYield, actualYield, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    stmt.run(
      c.id,
      c.userId,
      c.name,
      c.variety,
      c.category,
      formatDateTime(c.plantingDate),
      formatDateTime(c.harvestDate),
      c.growingPeriod,
      c.status, // Enum → String
      formatDecimal(c.expectedYield),
      formatDecimal(c.actualYield),
      c.notes,
      formatDateTime(c.createdAt),
      formatDateTime(c.updatedAt)
    );
    log.progress(i + 1, rows.length, "Crop");
  }

  log.success(`작물 ${rows.length}건 마이그레이션 완료`);
}

async function migrateFarmingLogs() {
  log.info("영농일지(FarmingLog) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"FarmingLog\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 영농일지가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO FarmingLog (id, userId, date, temperature, humidity, rainfall,
      weather, notes, photos, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const l = rows[i];
    stmt.run(
      l.id,
      l.userId,
      formatDateTime(l.date),
      formatDecimal(l.temperature),
      l.humidity,
      formatDecimal(l.rainfall),
      l.weather,
      l.notes,
      l.photos, // Already String or null in new schema
      formatDateTime(l.createdAt),
      formatDateTime(l.updatedAt)
    );
    log.progress(i + 1, rows.length, "FarmingLog");
  }

  log.success(`영농일지 ${rows.length}건 마이그레이션 완료`);
}

async function migrateFarmActivities() {
  log.info("영농활동(FarmActivity) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"FarmActivity\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 영농활동이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO FarmActivity (id, logId, type, cropId, plotId, description, quantity, unit, duration, workers, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    stmt.run(
      a.id,
      a.logId,
      a.type, // Enum → String
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

async function migrateInventoryItems() {
  log.info("재고(InventoryItem) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"InventoryItem\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 재고가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO InventoryItem (id, userId, name, category, quantity, unit, minQuantity,
      location, purchaseDate, expiryDate, price, supplier, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    stmt.run(
      item.id,
      item.userId,
      item.name,
      item.category, // Enum → String
      formatDecimal(item.quantity),
      item.unit,
      formatDecimal(item.minQuantity),
      item.location,
      formatDateTime(item.purchaseDate),
      formatDateTime(item.expiryDate),
      formatDecimal(item.price),
      item.supplier,
      item.notes,
      formatDateTime(item.createdAt),
      formatDateTime(item.updatedAt)
    );
    log.progress(i + 1, rows.length, "InventoryItem");
  }

  log.success(`재고 ${rows.length}건 마이그레이션 완료`);
}

async function migrateFarmFinanceRecords() {
  log.info("농가재정(FarmFinanceRecord) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"FarmFinanceRecord\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 농가재정이 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO FarmFinanceRecord (id, userId, date, type, category, amount, description,
      relatedCropId, paymentMethod, receipt, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    stmt.run(
      f.id,
      f.userId,
      formatDateTime(f.date),
      f.type, // Enum → String
      f.category, // Enum → String
      formatDecimal(f.amount),
      f.description,
      f.relatedCropId,
      f.paymentMethod,
      f.receipt,
      f.notes,
      formatDateTime(f.createdAt),
      formatDateTime(f.updatedAt)
    );
    log.progress(i + 1, rows.length, "FarmFinanceRecord");
  }

  log.success(`농가재정 ${rows.length}건 마이그레이션 완료`);
}

async function migrateMarketPrices() {
  log.info("시세(MarketPrice) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"MarketPrice\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 시세가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO MarketPrice (id, itemName, itemCode, unit, price, market, date,
      source, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    stmt.run(
      m.id,
      m.itemName,
      m.itemCode,
      m.unit,
      formatDecimal(m.price),
      m.market,
      formatDateTime(m.date),
      m.source,
      formatDateTime(m.createdAt)
    );
    log.progress(i + 1, rows.length, "MarketPrice");
  }

  log.success(`시세 ${rows.length}건 마이그레이션 완료`);
}

async function migrateWeatherData() {
  log.info("날씨(WeatherData) 마이그레이션 중...");

  const { rows } = await pgPool.query("SELECT * FROM \"WeatherData\"");

  if (rows.length === 0) {
    log.warning("마이그레이션할 날씨 데이터가 없습니다.");
    return;
  }

  const stmt = sqlite.prepare(`
    INSERT OR REPLACE INTO WeatherData (id, date, location, temperature, humidity, rainfall,
      windSpeed, condition, forecast, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i++) {
    const w = rows[i];
    stmt.run(
      w.id,
      formatDateTime(w.date),
      w.location,
      formatDecimal(w.temperature),
      w.humidity,
      formatDecimal(w.rainfall),
      formatDecimal(w.windSpeed),
      w.condition,
      w.forecast,
      formatDateTime(w.createdAt)
    );
    log.progress(i + 1, rows.length, "WeatherData");
  }

  log.success(`날씨 ${rows.length}건 마이그레이션 완료`);
}

async function main() {
  console.log("\n==========================================");
  console.log("  PostgreSQL → SQLite 데이터 마이그레이션");
  console.log("==========================================\n");

  log.info(
    `PostgreSQL URL: ${POSTGRES_URL.replace(/:[^:@]+@/, ":****@")}`
  );
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
    await migrateAssets();
    await migrateRealEstates();
    await migrateFinancialAssets();
    await migrateFundingSources();
    await migrateSetupCategories();
    await migrateSetupItems();
    await migrateLandParcels();
    await migratePlots();
    await migrateCrops();
    await migrateFarmingLogs();
    await migrateFarmActivities();
    await migrateInventoryItems();
    await migrateFarmFinanceRecords();
    await migrateMarketPrices();
    await migrateWeatherData();

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
