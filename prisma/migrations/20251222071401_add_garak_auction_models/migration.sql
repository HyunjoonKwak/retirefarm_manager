-- CreateTable
CREATE TABLE "AuctionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "variety" TEXT,
    "tempName" TEXT,
    "unit" TEXT NOT NULL,
    "grade" TEXT,
    "price" INTEGER NOT NULL,
    "origin" TEXT,
    "corporation" TEXT NOT NULL,
    "corporationCode" TEXT NOT NULL,
    "auctionDate" DATETIME NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "certification" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductWatchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variety" TEXT,
    "origin" TEXT,
    "targetPrice" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductWatchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataCollectionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetDate" DATETIME NOT NULL,
    "corporation" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "AuctionResult_productName_auctionDate_idx" ON "AuctionResult"("productName", "auctionDate");

-- CreateIndex
CREATE INDEX "AuctionResult_auctionDate_idx" ON "AuctionResult"("auctionDate");

-- CreateIndex
CREATE INDEX "AuctionResult_origin_idx" ON "AuctionResult"("origin");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionResult_productName_variety_corporation_auctionDate_price_origin_key" ON "AuctionResult"("productName", "variety", "corporation", "auctionDate", "price", "origin");

-- CreateIndex
CREATE UNIQUE INDEX "ProductWatchlist_userId_productName_variety_origin_key" ON "ProductWatchlist"("userId", "productName", "variety", "origin");
