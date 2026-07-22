-- Defensive dedup: remove rows that would collide under the new unique key
-- (keeps the earliest row of each duplicate group; no-op when no duplicates exist)
DELETE FROM "AuctionResult" WHERE "id" NOT IN (
  SELECT MIN("id") FROM "AuctionResult"
  GROUP BY "productName", coalesce("variety",''), "corporation", "auctionDate",
           "price", coalesce("origin",''), "unit", coalesce("grade",''), "quantity"
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuctionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "variety" TEXT NOT NULL DEFAULT '',
    "tempName" TEXT,
    "unit" TEXT NOT NULL,
    "grade" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "origin" TEXT NOT NULL DEFAULT '',
    "corporation" TEXT NOT NULL,
    "corporationCode" TEXT NOT NULL,
    "auctionDate" DATETIME NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "certification" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AuctionResult" ("auctionDate", "certification", "corporation", "corporationCode", "createdAt", "grade", "id", "origin", "price", "productName", "quantity", "tempName", "unit", "variety") SELECT "auctionDate", "certification", "corporation", "corporationCode", "createdAt", coalesce("grade", '') AS "grade", "id", coalesce("origin", '') AS "origin", "price", "productName", "quantity", "tempName", "unit", coalesce("variety", '') AS "variety" FROM "AuctionResult";
DROP TABLE "AuctionResult";
ALTER TABLE "new_AuctionResult" RENAME TO "AuctionResult";
CREATE INDEX "AuctionResult_productName_auctionDate_idx" ON "AuctionResult"("productName", "auctionDate");
CREATE INDEX "AuctionResult_auctionDate_idx" ON "AuctionResult"("auctionDate");
CREATE INDEX "AuctionResult_origin_idx" ON "AuctionResult"("origin");
CREATE UNIQUE INDEX "AuctionResult_productName_variety_corporation_auctionDate_price_origin_unit_grade_quantity_key" ON "AuctionResult"("productName", "variety", "corporation", "auctionDate", "price", "origin", "unit", "grade", "quantity");
CREATE TABLE "new_MaterialUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    CONSTRAINT "MaterialUsage_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "FarmActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialUsage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MaterialUsage" ("activityId", "id", "itemId", "quantity") SELECT "activityId", "id", "itemId", "quantity" FROM "MaterialUsage";
DROP TABLE "MaterialUsage";
ALTER TABLE "new_MaterialUsage" RENAME TO "MaterialUsage";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Crop_userId_status_idx" ON "Crop"("userId", "status");

-- CreateIndex
CREATE INDEX "FinancialTransaction_userId_date_idx" ON "FinancialTransaction"("userId", "date");

-- CreateIndex
CREATE INDEX "FundingSource_userId_idx" ON "FundingSource"("userId");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_idx" ON "InventoryItem"("userId");

-- CreateIndex
CREATE INDEX "SetupCostItem_userId_idx" ON "SetupCostItem"("userId");
