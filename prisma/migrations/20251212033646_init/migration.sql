-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isSsoUser" BOOLEAN NOT NULL DEFAULT false,
    "portalEmail" TEXT,
    "ssoEnabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "RetirementGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "targetDate" DATETIME NOT NULL,
    "estimatedRetirementPay" DECIMAL,
    "estimatedSeverancePay" DECIMAL,
    "initialLivingBuffer" DECIMAL,
    "bufferMonths" INTEGER DEFAULT 6,
    "monthlyLivingExpense" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RetirementGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RealEstateAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "area" DECIMAL NOT NULL,
    "acquisitionDate" DATETIME NOT NULL,
    "acquisitionPrice" DECIMAL NOT NULL,
    "currentPrice" DECIMAL NOT NULL,
    "expectedSalePrice" DECIMAL NOT NULL,
    "mortgageBalance" DECIMAL NOT NULL DEFAULT 0,
    "monthlyRent" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'HOLDING',
    "plannedSaleDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RealEstateAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SetupCostCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "SetupCostSubcategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SetupCostSubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SetupCostCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SetupCostItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "estimatedCost" DECIMAL NOT NULL,
    "actualCost" DECIMAL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT '개',
    "isGovernmentSubsidy" BOOLEAN NOT NULL DEFAULT false,
    "subsidyAmount" DECIMAL,
    "subsidyRate" DECIMAL,
    "priority" TEXT NOT NULL DEFAULT 'ESSENTIAL',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SetupCostItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SetupCostItem_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "SetupCostSubcategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundingSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "expectedDate" DATETIME NOT NULL,
    "linkedAssetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FundingSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FundingSource_linkedAssetId_fkey" FOREIGN KEY ("linkedAssetId") REFERENCES "RealEstateAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FarmingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "temperature" DECIMAL,
    "humidity" INTEGER,
    "rainfall" DECIMAL,
    "weather" TEXT,
    "notes" TEXT,
    "photos" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FarmingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FarmActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "logId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cropId" TEXT,
    "plotId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL,
    "unit" TEXT,
    "duration" INTEGER,
    "workers" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FarmActivity_logId_fkey" FOREIGN KEY ("logId") REFERENCES "FarmingLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FarmActivity_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    CONSTRAINT "MaterialUsage_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "FarmActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialUsage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Crop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variety" TEXT,
    "plantingDate" DATETIME NOT NULL,
    "expectedHarvestDate" DATETIME NOT NULL,
    "plotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GROWING',
    "growthStage" TEXT NOT NULL DEFAULT 'SEEDING',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Crop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "amount" DECIMAL NOT NULL,
    "description" TEXT NOT NULL,
    "relatedCropId" TEXT,
    "paymentMethod" TEXT,
    "receiptUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialTransaction_relatedCropId_fkey" FOREIGN KEY ("relatedCropId") REFERENCES "Crop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "currentQuantity" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL,
    "minimumQuantity" DECIMAL NOT NULL DEFAULT 0,
    "lastPurchaseDate" DATETIME,
    "lastPurchasePrice" DECIMAL,
    "location" TEXT,
    "expirationDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    CONSTRAINT "InventoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceWatchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    CONSTRAINT "PriceWatchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "targetPrice" DECIMAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PriceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketPriceCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,
    "marketName" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "avgPrice" DECIMAL NOT NULL,
    "maxPrice" DECIMAL NOT NULL,
    "minPrice" DECIMAL NOT NULL,
    "tradingVolume" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_portalEmail_key" ON "User"("portalEmail");

-- CreateIndex
CREATE UNIQUE INDEX "RetirementGoal_userId_key" ON "RetirementGoal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingSource_linkedAssetId_key" ON "FundingSource"("linkedAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmingLog_userId_date_key" ON "FarmingLog"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PriceWatchlist_userId_itemCode_key" ON "PriceWatchlist"("userId", "itemCode");

-- CreateIndex
CREATE INDEX "MarketPriceCache_itemCode_date_idx" ON "MarketPriceCache"("itemCode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPriceCache_itemCode_marketCode_date_key" ON "MarketPriceCache"("itemCode", "marketCode", "date");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
