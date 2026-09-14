-- Multi-option panels: a store may keep several active options. activeStoreKey stays as the legacy store marker but is no
-- longer unique; activeOptionKey becomes the unique active identity. Additive only: no panel row or observation is removed.
ALTER TABLE "CompetitorPanelEntry" ADD COLUMN "activeOptionKey" TEXT;

-- DropIndex
DROP INDEX "CompetitorPanelEntry_userId_activeStoreKey_key";

-- Backfill: every active legacy row gets a stable, unique placeholder key; archived rows carry no active marker.
UPDATE "CompetitorPanelEntry" SET "activeOptionKey" = 'legacy:' || "id" WHERE "archivedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorPanelEntry_userId_activeOptionKey_key" ON "CompetitorPanelEntry"("userId", "activeOptionKey");

-- CreateIndex
CREATE INDEX "CompetitorPanelEntry_userId_activeStoreKey_idx" ON "CompetitorPanelEntry"("userId", "activeStoreKey");
