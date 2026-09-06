CREATE TABLE "MarketRecoveryJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settingsId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "targetDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" DATETIME,
    "lastError" TEXT,
    "notifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketRecoveryJob_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "MarketCollectionSettings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketRecoveryJob_settingsId_scope_targetDate_key" ON "MarketRecoveryJob"("settingsId", "scope", "targetDate");
CREATE INDEX "MarketRecoveryJob_status_nextAttemptAt_idx" ON "MarketRecoveryJob"("status", "nextAttemptAt");
