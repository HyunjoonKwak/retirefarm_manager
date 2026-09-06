CREATE TABLE "MarketComparisonPreset" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "productName" TEXT NOT NULL,
 "varieties" TEXT NOT NULL DEFAULT '[]',
 "origin" TEXT,
 "unit" TEXT,
 "grade" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MarketComparisonPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MarketComparisonPreset_userId_createdAt_idx" ON "MarketComparisonPreset"("userId", "createdAt");
