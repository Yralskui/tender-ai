-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN "notifyTitleKeywords" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NotificationPreference" ADD COLUMN "titleKeywords" TEXT NOT NULL DEFAULT '';
