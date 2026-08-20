-- CreateTable
CREATE TABLE "FarmProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "farmingType" TEXT NOT NULL,
    "areaPyeong" DECIMAL,
    "targetStartYear" INTEGER,
    "plannedCrops" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FarmProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FarmProfile_userId_key" ON "FarmProfile"("userId");
