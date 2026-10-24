-- CreateTable
CREATE TABLE "DesIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "type" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "caller" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "disposition" TEXT,
    "subjects" TEXT NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DesIncidentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "text" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesIncidentLog_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "DesIncident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DesUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callsign" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "incidentId" TEXT,
    "since" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DesUnit_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "DesIncident" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DesIncident_number_key" ON "DesIncident"("number");

-- CreateIndex
CREATE INDEX "DesIncident_status_idx" ON "DesIncident"("status");

-- CreateIndex
CREATE INDEX "DesIncidentLog_incidentId_idx" ON "DesIncidentLog"("incidentId");

-- CreateIndex
CREATE INDEX "DesIncidentLog_createdAt_idx" ON "DesIncidentLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DesUnit_callsign_key" ON "DesUnit"("callsign");

-- CreateIndex
CREATE UNIQUE INDEX "DesUnit_memberId_key" ON "DesUnit"("memberId");
