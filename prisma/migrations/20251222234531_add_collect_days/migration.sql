-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MarketCollectionSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "autoCollectEnabled" BOOLEAN NOT NULL DEFAULT false,
    "collectTime" TEXT NOT NULL DEFAULT '09:30',
    "collectDaysAgo" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_MarketCollectionSettings" ("autoCleanupEnabled", "autoCollectEnabled", "collectDaysAgo", "collectTime", "corporationCodes", "createdAt", "defaultViewDays", "id", "retentionDays", "updatedAt", "userId") SELECT "autoCleanupEnabled", "autoCollectEnabled", "collectDaysAgo", "collectTime", "corporationCodes", "createdAt", "defaultViewDays", "id", "retentionDays", "updatedAt", "userId" FROM "MarketCollectionSettings";
DROP TABLE "MarketCollectionSettings";
ALTER TABLE "new_MarketCollectionSettings" RENAME TO "MarketCollectionSettings";
CREATE UNIQUE INDEX "MarketCollectionSettings_userId_key" ON "MarketCollectionSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
