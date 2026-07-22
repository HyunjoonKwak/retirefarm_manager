/*
  Warnings:

  - You are about to drop the column `isSsoUser` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `portalEmail` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `ssoEnabled` on the `User` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "kakaoId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "updatedAt", "role") SELECT "createdAt", "email", "id", "name", "updatedAt", 'USER' FROM "User";
-- Set the first registered user as ADMIN
UPDATE "new_User" SET "role" = 'ADMIN' WHERE "id" = (SELECT "id" FROM "new_User" ORDER BY "createdAt" ASC LIMIT 1);
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_kakaoId_key" ON "User"("kakaoId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
