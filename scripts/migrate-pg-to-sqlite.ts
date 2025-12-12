/**
 * PostgreSQL → SQLite 데이터 마이그레이션 스크립트
 *
 * 사용법:
 * 1. .env 파일에 PostgreSQL URL 설정
 *    POSTGRES_URL="postgresql://postgres:password@localhost:5432/retirefarm"
 *
 * 2. 스크립트 실행
 *    npx tsx scripts/migrate-pg-to-sqlite.ts
 */

import { PrismaClient as PostgresClient } from "@prisma/client";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";

// PostgreSQL 연결 (기존 데이터)
const POSTGRES_URL =
  process.env.POSTGRES_URL ||
  "postgresql://postgres:password@localhost:5432/retirefarm";

// SQLite 파일 경로
const SQLITE_PATH = "./prisma/data/retirefarm.db";

// PostgreSQL 클라이언트 (동적 URL 설정)
const pgClient = new PostgresClient({
  datasources: {
    db: {
      url: POSTGRES_URL,
    },
  },
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
function formatDateTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString();
}

// Decimal을 문자열로 변환
function formatDecimal(value: any): string | null {
  if (value === null || value === undefined) return null;
  return value.toString();
}

// 배열을 JSON 문자열로 변환
function formatArray(arr: string[] | null): string | null {
  if (!arr || arr.length === 0) return null;
  return JSON.stringify(arr);
}

// Boolean을 SQLite 정수로 변환
function formatBoolean(value: boolean): number {
  return value ? 1 : 0;
}

async function migrateUsers() {
  log.info("사용자(User) 마이그레이션 중...");

  const users = await pgClient.user.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO User (id, email, name, password, createdAt, updatedAt, isSsoUser, portalEmail, ssoEnabled)
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
  log.info("은퇴목표(RetirementGoal) 마이그레이션 중...");

  const goals = await pgClient.retirementGoal.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO RetirementGoal (id, userId, targetDate, estimatedRetirementPay, estimatedSeverancePay, initialLivingBuffer, bufferMonths, monthlyLivingExpense, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    stmt.run(
      g.id,
      g.userId,
      formatDateTime(g.targetDate),
      formatDecimal(g.estimatedRetirementPay),
      formatDecimal(g.estimatedSeverancePay),
      formatDecimal(g.initialLivingBuffer),
      g.bufferMonths,
      formatDecimal(g.monthlyLivingExpense),
      formatDateTime(g.createdAt),
      formatDateTime(g.updatedAt)
    );
    log.progress(i + 1, goals.length, "RetirementGoal");
  }

  log.success(`은퇴목표 ${goals.length}건 마이그레이션 완료`);
}

async function migrateSetupCostCategories() {
  log.info("설립비용 카테고리(SetupCostCategory) 마이그레이션 중...");

  const categories = await pgClient.setupCostCategory.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO SetupCostCategory (id, name, "order")
    VALUES (?, ?, ?)
  `);

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i];
    stmt.run(c.id, c.name, c.order);
    log.progress(i + 1, categories.length, "SetupCostCategory");
  }

  log.success(`설립비용 카테고리 ${categories.length}건 마이그레이션 완료`);
}

async function migrateSetupCostSubcategories() {
  log.info("설립비용 서브카테고리(SetupCostSubcategory) 마이그레이션 중...");

  const subcategories = await pgClient.setupCostSubcategory.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO SetupCostSubcategory (id, categoryId, name, "order")
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < subcategories.length; i++) {
    const s = subcategories[i];
    stmt.run(s.id, s.categoryId, s.name, s.order);
    log.progress(i + 1, subcategories.length, "SetupCostSubcategory");
  }

  log.success(`설립비용 서브카테고리 ${subcategories.length}건 마이그레이션 완료`);
}

async function migrateRealEstateAssets() {
  log.info("부동산 자산(RealEstateAsset) 마이그레이션 중...");

  const assets = await pgClient.realEstateAsset.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO RealEstateAsset (id, userId, name, propertyType, address, area, acquisitionDate, acquisitionPrice, currentPrice, expectedSalePrice, mortgageBalance, monthlyRent, status, plannedSaleDate, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    stmt.run(
      a.id,
      a.userId,
      a.name,
      a.propertyType, // enum → string
      a.address,
      formatDecimal(a.area),
      formatDateTime(a.acquisitionDate),
      formatDecimal(a.acquisitionPrice),
      formatDecimal(a.currentPrice),
      formatDecimal(a.expectedSalePrice),
      formatDecimal(a.mortgageBalance),
      formatDecimal(a.monthlyRent),
      a.status, // enum → string
      formatDateTime(a.plannedSaleDate),
      a.notes,
      formatDateTime(a.createdAt),
      formatDateTime(a.updatedAt)
    );
    log.progress(i + 1, assets.length, "RealEstateAsset");
  }

  log.success(`부동산 자산 ${assets.length}건 마이그레이션 완료`);
}

async function migrateSetupCostItems() {
  log.info("설립비용 항목(SetupCostItem) 마이그레이션 중...");

  const items = await pgClient.setupCostItem.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO SetupCostItem (id, userId, subcategoryId, name, description, estimatedCost, actualCost, quantity, unit, isGovernmentSubsidy, subsidyAmount, subsidyRate, priority, status, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
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
      item.priority, // enum → string
      item.status, // enum → string
      item.notes,
      formatDateTime(item.createdAt),
      formatDateTime(item.updatedAt)
    );
    log.progress(i + 1, items.length, "SetupCostItem");
  }

  log.success(`설립비용 항목 ${items.length}건 마이그레이션 완료`);
}

async function migrateFundingSources() {
  log.info("자금조달(FundingSource) 마이그레이션 중...");

  const sources = await pgClient.fundingSource.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO FundingSource (id, userId, type, name, amount, expectedDate, linkedAssetId, status, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    stmt.run(
      s.id,
      s.userId,
      s.type, // enum → string
      s.name,
      formatDecimal(s.amount),
      formatDateTime(s.expectedDate),
      s.linkedAssetId,
      s.status, // enum → string
      s.notes,
      formatDateTime(s.createdAt),
      formatDateTime(s.updatedAt)
    );
    log.progress(i + 1, sources.length, "FundingSource");
  }

  log.success(`자금조달 ${sources.length}건 마이그레이션 완료`);
}

async function migrateCrops() {
  log.info("작물(Crop) 마이그레이션 중...");

  const crops = await pgClient.crop.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO Crop (id, userId, name, variety, plantingDate, expectedHarvestDate, plotId, status, growthStage, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < crops.length; i++) {
    const c = crops[i];
    stmt.run(
      c.id,
      c.userId,
      c.name,
      c.variety,
      formatDateTime(c.plantingDate),
      formatDateTime(c.expectedHarvestDate),
      c.plotId,
      c.status, // enum → string
      c.growthStage, // enum → string
      c.notes,
      formatDateTime(c.createdAt),
      formatDateTime(c.updatedAt)
    );
    log.progress(i + 1, crops.length, "Crop");
  }

  log.success(`작물 ${crops.length}건 마이그레이션 완료`);
}

async function migrateInventoryItems() {
  log.info("재고(InventoryItem) 마이그레이션 중...");

  const items = await pgClient.inventoryItem.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO InventoryItem (id, userId, name, category, currentQuantity, unit, minimumQuantity, lastPurchaseDate, lastPurchasePrice, location, expirationDate, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    stmt.run(
      item.id,
      item.userId,
      item.name,
      item.category, // enum → string
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
    log.progress(i + 1, items.length, "InventoryItem");
  }

  log.success(`재고 ${items.length}건 마이그레이션 완료`);
}

async function migrateFarmingLogs() {
  log.info("영농일지(FarmingLog) 마이그레이션 중...");

  const logs = await pgClient.farmingLog.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO FarmingLog (id, userId, date, temperature, humidity, rainfall, weather, notes, photos, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];
    stmt.run(
      l.id,
      l.userId,
      formatDateTime(l.date),
      formatDecimal(l.temperature),
      l.humidity,
      formatDecimal(l.rainfall),
      l.weather,
      l.notes,
      l.photos, // PostgreSQL에서 이미 String 또는 null
      formatDateTime(l.createdAt),
      formatDateTime(l.updatedAt)
    );
    log.progress(i + 1, logs.length, "FarmingLog");
  }

  log.success(`영농일지 ${logs.length}건 마이그레이션 완료`);
}

async function migrateFarmActivities() {
  log.info("영농활동(FarmActivity) 마이그레이션 중...");

  const activities = await pgClient.farmActivity.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO FarmActivity (id, logId, type, cropId, plotId, description, quantity, unit, duration, workers, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    stmt.run(
      a.id,
      a.logId,
      a.type, // enum → string
      a.cropId,
      a.plotId,
      a.description,
      formatDecimal(a.quantity),
      a.unit,
      a.duration,
      a.workers,
      formatDateTime(a.createdAt)
    );
    log.progress(i + 1, activities.length, "FarmActivity");
  }

  log.success(`영농활동 ${activities.length}건 마이그레이션 완료`);
}

async function migrateMaterialUsages() {
  log.info("자재사용(MaterialUsage) 마이그레이션 중...");

  const usages = await pgClient.materialUsage.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO MaterialUsage (id, activityId, itemId, quantity)
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < usages.length; i++) {
    const u = usages[i];
    stmt.run(u.id, u.activityId, u.itemId, formatDecimal(u.quantity));
    log.progress(i + 1, usages.length, "MaterialUsage");
  }

  log.success(`자재사용 ${usages.length}건 마이그레이션 완료`);
}

async function migrateFinancialTransactions() {
  log.info("재무거래(FinancialTransaction) 마이그레이션 중...");

  const transactions = await pgClient.financialTransaction.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO FinancialTransaction (id, userId, date, type, category, subcategory, amount, description, relatedCropId, paymentMethod, receiptUrl, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    stmt.run(
      t.id,
      t.userId,
      formatDateTime(t.date),
      t.type, // enum → string
      t.category,
      t.subcategory,
      formatDecimal(t.amount),
      t.description,
      t.relatedCropId,
      t.paymentMethod,
      t.receiptUrl,
      formatDateTime(t.createdAt)
    );
    log.progress(i + 1, transactions.length, "FinancialTransaction");
  }

  log.success(`재무거래 ${transactions.length}건 마이그레이션 완료`);
}

async function migrateInventoryTransactions() {
  log.info("재고거래(InventoryTransaction) 마이그레이션 중...");

  const transactions = await pgClient.inventoryTransaction.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO InventoryTransaction (id, itemId, type, quantity, date, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    stmt.run(
      t.id,
      t.itemId,
      t.type,
      formatDecimal(t.quantity),
      formatDateTime(t.date),
      t.reason
    );
    log.progress(i + 1, transactions.length, "InventoryTransaction");
  }

  log.success(`재고거래 ${transactions.length}건 마이그레이션 완료`);
}

async function migratePriceWatchlists() {
  log.info("시세관심목록(PriceWatchlist) 마이그레이션 중...");

  const watchlists = await pgClient.priceWatchlist.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO PriceWatchlist (id, userId, itemCode, itemName)
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < watchlists.length; i++) {
    const w = watchlists[i];
    stmt.run(w.id, w.userId, w.itemCode, w.itemName);
    log.progress(i + 1, watchlists.length, "PriceWatchlist");
  }

  log.success(`시세관심목록 ${watchlists.length}건 마이그레이션 완료`);
}

async function migratePriceAlerts() {
  log.info("가격알림(PriceAlert) 마이그레이션 중...");

  const alerts = await pgClient.priceAlert.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO PriceAlert (id, userId, itemCode, itemName, condition, targetPrice, isActive)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < alerts.length; i++) {
    const a = alerts[i];
    stmt.run(
      a.id,
      a.userId,
      a.itemCode,
      a.itemName,
      a.condition,
      formatDecimal(a.targetPrice),
      formatBoolean(a.isActive)
    );
    log.progress(i + 1, alerts.length, "PriceAlert");
  }

  log.success(`가격알림 ${alerts.length}건 마이그레이션 완료`);
}

async function migrateMarketPriceCache() {
  log.info("시장가격캐시(MarketPriceCache) 마이그레이션 중...");

  const caches = await pgClient.marketPriceCache.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO MarketPriceCache (id, itemCode, itemName, marketCode, marketName, date, avgPrice, maxPrice, minPrice, tradingVolume, unit, fetchedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < caches.length; i++) {
    const c = caches[i];
    stmt.run(
      c.id,
      c.itemCode,
      c.itemName,
      c.marketCode,
      c.marketName,
      formatDateTime(c.date),
      formatDecimal(c.avgPrice),
      formatDecimal(c.maxPrice),
      formatDecimal(c.minPrice),
      formatDecimal(c.tradingVolume),
      c.unit,
      formatDateTime(c.fetchedAt)
    );
    log.progress(i + 1, caches.length, "MarketPriceCache");
  }

  log.success(`시장가격캐시 ${caches.length}건 마이그레이션 완료`);
}

async function migrateNotifications() {
  log.info("알림(Notification) 마이그레이션 중...");

  const notifications = await pgClient.notification.findMany();
  const stmt = sqlite.prepare(`
    INSERT INTO Notification (id, userId, type, title, message, link, isRead, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < notifications.length; i++) {
    const n = notifications[i];
    stmt.run(
      n.id,
      n.userId,
      n.type, // enum → string
      n.title,
      n.message,
      n.link,
      formatBoolean(n.isRead),
      formatDateTime(n.createdAt)
    );
    log.progress(i + 1, notifications.length, "Notification");
  }

  log.success(`알림 ${notifications.length}건 마이그레이션 완료`);
}

async function clearSqliteData() {
  log.warning("SQLite 기존 데이터 삭제 중...");

  // 외래키 제약 비활성화
  sqlite.exec("PRAGMA foreign_keys = OFF;");

  // 역순으로 삭제 (외래키 의존성)
  const tables = [
    "Notification",
    "MarketPriceCache",
    "PriceAlert",
    "PriceWatchlist",
    "InventoryTransaction",
    "MaterialUsage",
    "FarmActivity",
    "FarmingLog",
    "FinancialTransaction",
    "FundingSource",
    "SetupCostItem",
    "InventoryItem",
    "Crop",
    "RealEstateAsset",
    "SetupCostSubcategory",
    "SetupCostCategory",
    "RetirementGoal",
    "User",
  ];

  for (const table of tables) {
    try {
      sqlite.exec(`DELETE FROM ${table};`);
    } catch (e) {
      // 테이블이 없을 수 있음
    }
  }

  // 외래키 제약 다시 활성화
  sqlite.exec("PRAGMA foreign_keys = ON;");

  log.success("SQLite 기존 데이터 삭제 완료");
}

async function main() {
  console.log("");
  console.log("==========================================");
  console.log("  PostgreSQL → SQLite 데이터 마이그레이션");
  console.log("==========================================");
  console.log("");

  log.info(`PostgreSQL URL: ${POSTGRES_URL.replace(/:[^:@]+@/, ':****@')}`);
  log.info(`SQLite 파일: ${SQLITE_PATH}`);
  console.log("");

  try {
    // PostgreSQL 연결 테스트
    log.info("PostgreSQL 연결 테스트 중...");
    await pgClient.$connect();
    log.success("PostgreSQL 연결 성공");

    // SQLite 기존 데이터 삭제
    await clearSqliteData();

    console.log("");
    log.info("데이터 마이그레이션 시작...");
    console.log("");

    // 순서대로 마이그레이션 (외래키 의존성 순서)
    await migrateUsers();
    await migrateRetirementGoals();
    await migrateSetupCostCategories();
    await migrateSetupCostSubcategories();
    await migrateRealEstateAssets();
    await migrateSetupCostItems();
    await migrateFundingSources();
    await migrateCrops();
    await migrateInventoryItems();
    await migrateFarmingLogs();
    await migrateFarmActivities();
    await migrateMaterialUsages();
    await migrateFinancialTransactions();
    await migrateInventoryTransactions();
    await migratePriceWatchlists();
    await migratePriceAlerts();
    await migrateMarketPriceCache();
    await migrateNotifications();

    console.log("");
    log.success("==========================================");
    log.success("  마이그레이션 완료!");
    log.success("==========================================");
    console.log("");
  } catch (error) {
    console.log("");
    log.error("마이그레이션 중 오류 발생:");
    console.error(error);
    process.exit(1);
  } finally {
    await pgClient.$disconnect();
    sqlite.close();
  }
}

main();
