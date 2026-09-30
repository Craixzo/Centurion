-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "robloxId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "suspendedUntil" DATETIME,
    "unsuspendRank" INTEGER,
    "isBanned" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "XpRecord" (
    "robloxId" TEXT NOT NULL PRIMARY KEY,
    "xp" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "type" TEXT,
    "gameLink" TEXT,
    "startsAt" DATETIME,
    "hostId" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remind5Sent" BOOLEAN NOT NULL DEFAULT false,
    "remindStartSent" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "EventRsvp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "attending" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Loa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QuotaStrike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TEXT,
    "fired" BOOLEAN NOT NULL DEFAULT false
);

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
CREATE INDEX "User_groupId_idx" ON "User"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "User_robloxId_groupId_key" ON "User"("robloxId", "groupId");

-- CreateIndex
CREATE INDEX "XpRecord_xp_idx" ON "XpRecord"("xp");

-- CreateIndex
CREATE UNIQUE INDEX "Event_messageId_key" ON "Event"("messageId");

-- CreateIndex
CREATE INDEX "Event_guildId_idx" ON "Event"("guildId");

-- CreateIndex
CREATE INDEX "Event_hostId_idx" ON "Event"("hostId");

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvp_eventId_discordId_key" ON "EventRsvp"("eventId", "discordId");

-- CreateIndex
CREATE INDEX "Loa_guildId_discordId_idx" ON "Loa"("guildId", "discordId");

-- CreateIndex
CREATE INDEX "Loa_endsAt_idx" ON "Loa"("endsAt");

-- CreateIndex
CREATE INDEX "QuotaStrike_guildId_groupId_idx" ON "QuotaStrike"("guildId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaStrike_guildId_groupId_discordId_key" ON "QuotaStrike"("guildId", "groupId", "discordId");

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
