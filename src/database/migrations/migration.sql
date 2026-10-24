-- CreateTable
CREATE TABLE "DesCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "department" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "occurredAt" TEXT,
    "evidence" TEXT NOT NULL DEFAULT '[]',
    "accusedText" TEXT,
    "accusedMemberId" TEXT,
    "accusedName" TEXT,
    "subjects" TEXT NOT NULL DEFAULT '[]',
    "linkedCall" TEXT,
    "submitterDiscordId" TEXT,
    "submitterName" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "assignedTo" TEXT,
    "assignedName" TEXT,
    "finding" TEXT,
    "publicNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DesCaseLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "text" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesCaseLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DesCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DesCase_number_key" ON "DesCase"("number");

-- CreateIndex
CREATE INDEX "DesCase_kind_status_idx" ON "DesCase"("kind", "status");

-- CreateIndex
CREATE INDEX "DesCase_submitterDiscordId_idx" ON "DesCase"("submitterDiscordId");

-- CreateIndex
CREATE INDEX "DesCase_accusedMemberId_idx" ON "DesCase"("accusedMemberId");

-- CreateIndex
CREATE INDEX "DesCaseLog_caseId_idx" ON "DesCaseLog"("caseId");
