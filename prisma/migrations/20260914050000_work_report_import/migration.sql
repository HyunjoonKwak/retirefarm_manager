-- CreateTable
CREATE TABLE "WorkReportImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "sourceUrl" TEXT,
    "rawMarkdown" TEXT NOT NULL,
    "rawJson" TEXT,
    "normalized" TEXT,
    "contentHash" TEXT NOT NULL,
    "parentId" TEXT,
    "correctionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkReportImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkReportImport_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkReportImport" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- CreateIndex
CREATE INDEX "WorkReportImport_userId_createdAt_idx" ON "WorkReportImport"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkReportImport_userId_contentHash_key" ON "WorkReportImport"("userId", "contentHash");

