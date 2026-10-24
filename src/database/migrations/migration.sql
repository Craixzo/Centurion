-- CreateTable
CREATE TABLE "DesMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL,
    "robloxUsername" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "rank" TEXT NOT NULL,
    "unit" TEXT,
    "roles" TEXT NOT NULL DEFAULT '["officer"]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT,
    "passwordSetAt" DATETIME,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DesAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DesMember_discordId_key" ON "DesMember"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "DesMember_badgeId_key" ON "DesMember"("badgeId");

-- CreateIndex
CREATE INDEX "DesMember_department_status_idx" ON "DesMember"("department", "status");

-- CreateIndex
CREATE INDEX "DesAudit_createdAt_idx" ON "DesAudit"("createdAt");

-- CreateIndex
CREATE INDEX "DesAudit_actorId_idx" ON "DesAudit"("actorId");
