-- CreateTable
CREATE TABLE "RecruitmentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "branch" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_BRANCH',
    "activeKey" TEXT,
    "officerId" TEXT,
    "channelId" TEXT,
    "controlMessageId" TEXT,
    "noticeChannelId" TEXT,
    "noticeMessageId" TEXT,
    "dmReachable" BOOLEAN NOT NULL DEFAULT true,
    "flag" TEXT,
    "recruitSpoke" BOOLEAN NOT NULL DEFAULT false,
    "officerSpoke" BOOLEAN NOT NULL DEFAULT false,
    "division" TEXT,
    "closeReason" TEXT,
    "claimedAt" DATETIME,
    "reminderSentAt" DATETIME,
    "extendedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "closedAt" DATETIME
);

-- CreateTable
CREATE TABLE "RecruitmentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecruitmentLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RecruitmentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentRequest_activeKey_key" ON "RecruitmentRequest"("activeKey");

-- CreateIndex
CREATE INDEX "RecruitmentRequest_status_idx" ON "RecruitmentRequest"("status");

-- CreateIndex
CREATE INDEX "RecruitmentRequest_discordId_idx" ON "RecruitmentRequest"("discordId");

-- CreateIndex
CREATE INDEX "RecruitmentRequest_officerId_idx" ON "RecruitmentRequest"("officerId");

-- CreateIndex
CREATE INDEX "RecruitmentRequest_channelId_idx" ON "RecruitmentRequest"("channelId");

-- CreateIndex
CREATE INDEX "RecruitmentLog_requestId_idx" ON "RecruitmentLog"("requestId");
