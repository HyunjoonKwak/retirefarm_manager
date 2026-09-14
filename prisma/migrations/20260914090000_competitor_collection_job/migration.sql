-- CreateTable
CREATE TABLE "CompetitorCollectionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "query" TEXT NOT NULL,
    "searchUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "runId" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompetitorCollectionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompetitorCollectionJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CompetitorDiscoveryRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorCollectionJob_runId_key" ON "CompetitorCollectionJob"("runId");

-- CreateIndex
CREATE INDEX "CompetitorCollectionJob_userId_status_createdAt_idx" ON "CompetitorCollectionJob"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitorCollectionJob_userId_createdAt_idx" ON "CompetitorCollectionJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitorCollectionJob_userId_status_completedAt_idx" ON "CompetitorCollectionJob"("userId", "status", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorCollectionJob_userId_weekStart_query_key" ON "CompetitorCollectionJob"("userId", "weekStart", "query");

