-- AlterTable
ALTER TABLE "QuotaStrike" ADD COLUMN "firstSeenWeek" TEXT;
ALTER TABLE "QuotaStrike" ADD COLUMN "pendingTrial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuotaStrike" ADD COLUMN "firedFromRoleId" TEXT;

-- CreateTable
CREATE TABLE "QuotaCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "discordId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "strikes" INTEGER NOT NULL,
    "hosted" INTEGER NOT NULL DEFAULT 0,
    "wasFired" BOOLEAN NOT NULL DEFAULT false,
    "prevRoleId" TEXT,
    "reason" TEXT,
    "ruling" TEXT,
    "reviewerId" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "QuotaCase_number_key" ON "QuotaCase"("number");
CREATE UNIQUE INDEX "QuotaCase_discordId_weekKey_kind_key" ON "QuotaCase"("discordId", "weekKey", "kind");
CREATE INDEX "QuotaCase_status_idx" ON "QuotaCase"("status");
