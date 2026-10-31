-- CreateTable
CREATE TABLE "ModmailThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastFrom" TEXT NOT NULL DEFAULT 'USER',
    "channelId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ModmailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL DEFAULT false,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ModmailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "applyOnSite" BOOLEAN NOT NULL DEFAULT true,
    "howToApply" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "postedBy" TEXT NOT NULL,
    "postedName" TEXT NOT NULL,
    "closesAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT NOT NULL,
    "robloxUsername" TEXT NOT NULL,
    "robloxUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME
);

-- CreateTable
CREATE TABLE "SiteDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "effectiveDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "updatedBy" TEXT NOT NULL,
    "updatedName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "SiteAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ModmailThread_number_key" ON "ModmailThread"("number");
CREATE INDEX "ModmailThread_discordId_idx" ON "ModmailThread"("discordId");
CREATE INDEX "ModmailThread_status_idx" ON "ModmailThread"("status");
CREATE INDEX "ModmailMessage_threadId_idx" ON "ModmailMessage"("threadId");
CREATE INDEX "JobListing_status_idx" ON "JobListing"("status");
CREATE INDEX "JobListing_postedBy_idx" ON "JobListing"("postedBy");
CREATE INDEX "JobApplication_listingId_idx" ON "JobApplication"("listingId");
CREATE INDEX "JobApplication_discordId_idx" ON "JobApplication"("discordId");
CREATE UNIQUE INDEX "SiteDocument_slug_key" ON "SiteDocument"("slug");
CREATE INDEX "SiteDocument_status_idx" ON "SiteDocument"("status");
CREATE INDEX "SiteAudit_createdAt_idx" ON "SiteAudit"("createdAt");
