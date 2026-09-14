-- CreateTable
CREATE TABLE "CompetitorSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "response" TEXT,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitorPanelEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storeKey" TEXT NOT NULL,
    "activeStoreKey" TEXT,
    "storeName" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT '토마토',
    "varietyGroup" TEXT NOT NULL,
    "qualityGroup" TEXT NOT NULL,
    "optionLabel" TEXT NOT NULL,
    "packageKg" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    "archiveReason" TEXT,
    CONSTRAINT "CompetitorPanelEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitorPriceObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "price" INTEGER,
    "shippingFee" INTEGER,
    "availability" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorPriceObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompetitorPriceObservation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitorPanelEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CompetitorSearch_userId_createdAt_idx" ON "CompetitorSearch"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorSearch_userId_query_bucket_key" ON "CompetitorSearch"("userId", "query", "bucket");

-- CreateIndex
CREATE INDEX "CompetitorPanelEntry_userId_createdAt_idx" ON "CompetitorPanelEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorPanelEntry_userId_activeStoreKey_key" ON "CompetitorPanelEntry"("userId", "activeStoreKey");

-- CreateIndex
CREATE INDEX "CompetitorPriceObservation_userId_observedAt_idx" ON "CompetitorPriceObservation"("userId", "observedAt");

-- CreateIndex
CREATE INDEX "CompetitorPriceObservation_entryId_observedAt_idx" ON "CompetitorPriceObservation"("entryId", "observedAt");

