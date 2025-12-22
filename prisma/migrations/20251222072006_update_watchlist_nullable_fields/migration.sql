-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductWatchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variety" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL DEFAULT '',
    "targetPrice" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductWatchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductWatchlist" ("createdAt", "id", "isActive", "origin", "productName", "targetPrice", "updatedAt", "userId", "variety") SELECT "createdAt", "id", "isActive", coalesce("origin", '') AS "origin", "productName", "targetPrice", "updatedAt", "userId", coalesce("variety", '') AS "variety" FROM "ProductWatchlist";
DROP TABLE "ProductWatchlist";
ALTER TABLE "new_ProductWatchlist" RENAME TO "ProductWatchlist";
CREATE UNIQUE INDEX "ProductWatchlist_userId_productName_variety_origin_key" ON "ProductWatchlist"("userId", "productName", "variety", "origin");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
