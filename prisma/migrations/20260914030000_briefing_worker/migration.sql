CREATE TABLE "BriefingWorkerCredential" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "lastSeenAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BriefingWorkerCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BriefingWorkerCredential_userId_key" ON "BriefingWorkerCredential"("userId");
CREATE UNIQUE INDEX "BriefingWorkerCredential_tokenHash_key" ON "BriefingWorkerCredential"("tokenHash");
CREATE TABLE "BriefingRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "weekStart" DATETIME NOT NULL,
  "inputHash" TEXT NOT NULL, "snapshot" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "leaseToken" TEXT, "leaseUntil" DATETIME, "credentialId" TEXT,
  "lastError" TEXT, "resultHash" TEXT, "usage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BriefingRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BriefingRun_userId_weekStart_inputHash_key" ON "BriefingRun"("userId", "weekStart", "inputHash");
CREATE INDEX "BriefingRun_userId_status_createdAt_idx" ON "BriefingRun"("userId", "status", "createdAt");
CREATE TABLE "WeeklyBriefing" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "runId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "body" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WeeklyBriefing_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BriefingRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WeeklyBriefing_runId_key" ON "WeeklyBriefing"("runId");
CREATE INDEX "WeeklyBriefing_userId_createdAt_idx" ON "WeeklyBriefing"("userId", "createdAt");
