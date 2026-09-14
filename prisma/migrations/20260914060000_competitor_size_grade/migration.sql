-- Existing panel rows keep UNKNOWN / empty criteria and therefore stay outside size-aware statistics.
ALTER TABLE "CompetitorPanelEntry" ADD COLUMN "sizeGrade" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompetitorPanelEntry" ADD COLUMN "sizeCriteria" TEXT NOT NULL DEFAULT '';
