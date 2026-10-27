-- CreateTable
CREATE TABLE "DesPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "department" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DesApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT NOT NULL,
    "robloxUserId" TEXT NOT NULL,
    "robloxUsername" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "answers" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "publicNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedName" TEXT,
    "memberId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "decidedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DesApplicationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "text" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesApplicationLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "DesApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DesPost_removed_pinned_createdAt_idx" ON "DesPost"("removed", "pinned", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DesApplication_number_key" ON "DesApplication"("number");

-- CreateIndex
CREATE INDEX "DesApplication_status_idx" ON "DesApplication"("status");

-- CreateIndex
CREATE INDEX "DesApplication_discordId_idx" ON "DesApplication"("discordId");

-- CreateIndex
CREATE INDEX "DesApplicationLog_applicationId_idx" ON "DesApplicationLog"("applicationId");
