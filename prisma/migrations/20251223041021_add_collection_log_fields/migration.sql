-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DataCollectionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetDate" DATETIME NOT NULL,
    "corporation" TEXT NOT NULL,
    "targetProducts" TEXT,
    "totalCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
INSERT INTO "new_DataCollectionLog" ("completedAt", "corporation", "errorMessage", "id", "newCount", "startedAt", "status", "targetDate", "totalCount") SELECT "completedAt", "corporation", "errorMessage", "id", "newCount", "startedAt", "status", "targetDate", "totalCount" FROM "DataCollectionLog";
DROP TABLE "DataCollectionLog";
ALTER TABLE "new_DataCollectionLog" RENAME TO "DataCollectionLog";
CREATE INDEX "DataCollectionLog_targetDate_idx" ON "DataCollectionLog"("targetDate");
CREATE INDEX "DataCollectionLog_status_idx" ON "DataCollectionLog"("status");
CREATE TABLE "new_MarketCollectionSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "autoCollectEnabled" BOOLEAN NOT NULL DEFAULT false,
    "collectTime" TEXT NOT NULL DEFAULT '09:30',
    "collectDaysAgo" INTEGER NOT NULL DEFAULT 0,
    "collectDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "corporationCodes" TEXT NOT NULL DEFAULT '11000101',
    "targetProducts" TEXT NOT NULL DEFAULT '토마토,포도',
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "autoCleanupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultViewDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketCollectionSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MarketCollectionSettings" ("autoCleanupEnabled", "autoCollectEnabled", "collectDays", "collectDaysAgo", "collectTime", "corporationCodes", "createdAt", "defaultViewDays", "id", "retentionDays", "targetProducts", "updatedAt", "userId") SELECT "autoCleanupEnabled", "autoCollectEnabled", "collectDays", "collectDaysAgo", "collectTime", "corporationCodes", "createdAt", "defaultViewDays", "id", "retentionDays", "targetProducts", "updatedAt", "userId" FROM "MarketCollectionSettings";
DROP TABLE "MarketCollectionSettings";
ALTER TABLE "new_MarketCollectionSettings" RENAME TO "MarketCollectionSettings";
CREATE UNIQUE INDEX "MarketCollectionSettings_userId_key" ON "MarketCollectionSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
