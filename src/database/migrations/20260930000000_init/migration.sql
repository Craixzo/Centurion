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
