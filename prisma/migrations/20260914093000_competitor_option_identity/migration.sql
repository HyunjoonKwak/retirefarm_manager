-- Existing panel rows keep empty cultivar / UNKNOWN identity and therefore stay outside identity-aware statistics until archived and re-registered.
ALTER TABLE "CompetitorPanelEntry" ADD COLUMN "cultivarName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CompetitorPanelEntry" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompetitorPanelEntry" ADD COLUMN "mixture" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompetitorPanelEntry" ADD COLUMN "processing" TEXT NOT NULL DEFAULT 'UNKNOWN';
