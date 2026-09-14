-- CreateTable
CREATE TABLE "CompetitorDiscoveryRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "evidenceCount" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL_PUBLIC_SEARCH',
    "policyVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorDiscoveryRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitorDiscoveryCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "storeKey" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WATCH',
    "decisionReason" TEXT,
    "lastSeenAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorDiscoveryCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitorDiscoveryEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "payload" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    CONSTRAINT "CompetitorDiscoveryEvidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CompetitorDiscoveryCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompetitorDiscoveryEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CompetitorDiscoveryRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitorDiscoveryDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorDiscoveryDecision_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CompetitorDiscoveryCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CompetitorDiscoveryRun_userId_createdAt_idx" ON "CompetitorDiscoveryRun"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorDiscoveryRun_userId_contentHash_key" ON "CompetitorDiscoveryRun"("userId", "contentHash");

-- CreateIndex
CREATE INDEX "CompetitorDiscoveryCandidate_userId_lastSeenAt_idx" ON "CompetitorDiscoveryCandidate"("userId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorDiscoveryCandidate_userId_productUrl_key" ON "CompetitorDiscoveryCandidate"("userId", "productUrl");

-- CreateIndex
CREATE INDEX "CompetitorDiscoveryEvidence_candidateId_observedAt_idx" ON "CompetitorDiscoveryEvidence"("candidateId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorDiscoveryEvidence_candidateId_query_observedAt_key" ON "CompetitorDiscoveryEvidence"("candidateId", "query", "observedAt");

-- CreateIndex
CREATE INDEX "CompetitorDiscoveryDecision_candidateId_createdAt_idx" ON "CompetitorDiscoveryDecision"("candidateId", "createdAt");

