-- Денормализация флагов Tender + updatedAt для инкрементального кэша

ALTER TABLE "Tender" ADD COLUMN "importedFromEis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tender" ADD COLUMN "tzEnrichmentPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tender" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Tender_status_importedFromEis_idx" ON "Tender"("status", "importedFromEis");
CREATE INDEX "Tender_status_importedFromEis_deadline_idx" ON "Tender"("status", "importedFromEis", "deadline");
CREATE INDEX "Tender_status_tzEnrichmentPending_idx" ON "Tender"("status", "tzEnrichmentPending");

UPDATE "Tender"
SET "importedFromEis" = true
WHERE "requirements" LIKE '%"importedFromEis":true%'
  AND "requirements" NOT LIKE '%"isDemo":true%';

UPDATE "Tender"
SET "tzEnrichmentPending" = true
WHERE "requirements" LIKE '%"tzEnrichmentPending":true%';
