-- AlterTable
ALTER TABLE "User" ADD COLUMN "accountDeletionToken" TEXT;
ALTER TABLE "User" ADD COLUMN "accountDeletionExpiresAt" DATETIME;

CREATE UNIQUE INDEX "User_accountDeletionToken_key" ON "User"("accountDeletionToken");
