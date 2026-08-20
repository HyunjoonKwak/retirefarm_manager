/*
  Warnings:

  - You are about to drop the `ExternalAssetSnapshot` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ExternalAssetSnapshot";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "HubNetWorthCache" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "netWorthKrw" BIGINT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" TEXT NOT NULL
);
