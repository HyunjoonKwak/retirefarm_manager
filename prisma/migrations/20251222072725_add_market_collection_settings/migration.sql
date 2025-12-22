-- CreateTable
CREATE TABLE "MarketCollectionSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "autoCollectEnabled" BOOLEAN NOT NULL DEFAULT false,
    "collectTime" TEXT NOT NULL DEFAULT '06:00',
    "collectDaysAgo" INTEGER NOT NULL DEFAULT 1,
    "corporationCodes" TEXT NOT NULL DEFAULT '11000101',
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "autoCleanupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultViewDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketCollectionSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketCollectionSettings_userId_key" ON "MarketCollectionSettings"("userId");

-- CreateIndex
CREATE INDEX "DataCollectionLog_targetDate_idx" ON "DataCollectionLog"("targetDate");

-- CreateIndex
CREATE INDEX "DataCollectionLog_status_idx" ON "DataCollectionLog"("status");
