-- CreateTable
CREATE TABLE "DesSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "robloxUserId" TEXT NOT NULL,
    "robloxUsername" TEXT NOT NULL,
    "characterName" TEXT,
    "flags" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DesRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "charges" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "location" TEXT,
    "officerId" TEXT NOT NULL,
    "officerName" TEXT NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "removedBy" TEXT,
    "removedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesRecord_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "DesSubject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DesWarrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "charges" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "danger" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "onWantedList" BOOLEAN NOT NULL DEFAULT false,
    "issuedBy" TEXT NOT NULL,
    "issuedByName" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT,
    "closedAt" DATETIME,
    "closedNote" TEXT,
    CONSTRAINT "DesWarrant_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "DesSubject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DesSubject_robloxUserId_key" ON "DesSubject"("robloxUserId");

-- CreateIndex
CREATE INDEX "DesSubject_robloxUsername_idx" ON "DesSubject"("robloxUsername");

-- CreateIndex
CREATE INDEX "DesRecord_subjectId_idx" ON "DesRecord"("subjectId");

-- CreateIndex
CREATE INDEX "DesRecord_createdAt_idx" ON "DesRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DesWarrant_number_key" ON "DesWarrant"("number");

-- CreateIndex
CREATE INDEX "DesWarrant_status_onWantedList_idx" ON "DesWarrant"("status", "onWantedList");

-- CreateIndex
CREATE INDEX "DesWarrant_subjectId_idx" ON "DesWarrant"("subjectId");
