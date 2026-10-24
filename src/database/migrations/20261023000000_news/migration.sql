-- CreateTable
CREATE TABLE "NewsOutlet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#bed215',
    "iconFile" TEXT,
    "coverFile" TEXT,
    "sections" TEXT NOT NULL DEFAULT '[]',
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestChannelId" TEXT,
    "requestMessageId" TEXT,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "NewsMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outletId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WRITER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "addedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    CONSTRAINT "NewsMember_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "NewsOutlet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outletId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL DEFAULT '[]',
    "coverFile" TEXT,
    "coverCaption" TEXT,
    "section" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isCoverStory" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "announceMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "submittedAt" DATETIME,
    "publishedAt" DATETIME,
    CONSTRAINT "NewsArticle_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "NewsOutlet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsOutlet_slug_key" ON "NewsOutlet"("slug");

-- CreateIndex
CREATE INDEX "NewsOutlet_status_idx" ON "NewsOutlet"("status");

-- CreateIndex
CREATE INDEX "NewsOutlet_ownerId_idx" ON "NewsOutlet"("ownerId");

-- CreateIndex
CREATE INDEX "NewsMember_discordId_idx" ON "NewsMember"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsMember_outletId_discordId_key" ON "NewsMember"("outletId", "discordId");

-- CreateIndex
CREATE INDEX "NewsArticle_status_idx" ON "NewsArticle"("status");

-- CreateIndex
CREATE INDEX "NewsArticle_outletId_status_publishedAt_idx" ON "NewsArticle"("outletId", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_outletId_slug_key" ON "NewsArticle"("outletId", "slug");
