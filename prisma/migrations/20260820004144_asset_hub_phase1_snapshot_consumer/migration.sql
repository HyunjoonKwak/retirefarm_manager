/*
  Warnings:

  - You are about to drop the `RealEstateAsset` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `linkedAssetId` on the `FundingSource` table. All the data in the column will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RealEstateAsset";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ExternalAssetSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueKrw" BIGINT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FundingSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "expectedDate" DATETIME NOT NULL,
    "externalAssetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FundingSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FundingSource" ("amount", "createdAt", "expectedDate", "id", "name", "notes", "status", "type", "updatedAt", "userId") SELECT "amount", "createdAt", "expectedDate", "id", "name", "notes", "status", "type", "updatedAt", "userId" FROM "FundingSource";
DROP TABLE "FundingSource";
ALTER TABLE "new_FundingSource" RENAME TO "FundingSource";
CREATE UNIQUE INDEX "FundingSource_externalAssetId_key" ON "FundingSource"("externalAssetId");
CREATE INDEX "FundingSource_userId_idx" ON "FundingSource"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ExternalAssetSnapshot_source_idx" ON "ExternalAssetSnapshot"("source");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAssetSnapshot_source_category_key" ON "ExternalAssetSnapshot"("source", "category");
