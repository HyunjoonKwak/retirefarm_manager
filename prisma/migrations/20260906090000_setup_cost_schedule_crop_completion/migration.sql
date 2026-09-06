-- Review A2: setup cost spending schedule (nullable, no backfill — legacy rows fall back at read time)
-- AlterTable
ALTER TABLE "SetupCostItem" ADD COLUMN "plannedDate" DATETIME;
ALTER TABLE "SetupCostItem" ADD COLUMN "paidAt" DATETIME;

-- Review A4: crop completion timestamp (nullable, no backfill — reports fall back to updatedAt and flag it as estimated)
-- AlterTable
ALTER TABLE "Crop" ADD COLUMN "completedAt" DATETIME;

-- Persist provenance when a legacy completion date is frozen on first edit.
ALTER TABLE "Crop" ADD COLUMN "completedAtEstimated" BOOLEAN NOT NULL DEFAULT false;
