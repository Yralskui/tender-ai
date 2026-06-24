-- AlterTable
ALTER TABLE "TenderMatch" ADD COLUMN "feedScore" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TenderMatch" ADD COLUMN "showInFeed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenderMatch" ADD COLUMN "showInProfile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenderMatch" ADD COLUMN "ruMatched" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenderMatch" ADD COLUMN "ruPartial" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenderMatch" ADD COLUMN "ruTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenderMatch" ADD COLUMN "forecastChance" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TenderMatch" ADD COLUMN "relevanceScore" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TenderMatch" ADD COLUMN "hideReason" TEXT;
ALTER TABLE "TenderMatch" ADD COLUMN "catalogHash" TEXT;
ALTER TABLE "TenderMatch" ADD COLUMN "computedAt" DATETIME;
ALTER TABLE "TenderMatch" ADD COLUMN "updatedAt" DATETIME;

CREATE INDEX "TenderMatch_companyId_showInFeed_feedScore_idx" ON "TenderMatch"("companyId", "showInFeed", "feedScore");
CREATE INDEX "TenderMatch_companyId_showInProfile_relevanceScore_idx" ON "TenderMatch"("companyId", "showInProfile", "relevanceScore");
