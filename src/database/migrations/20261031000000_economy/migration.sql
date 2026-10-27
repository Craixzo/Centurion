-- CreateTable
CREATE TABLE "EconCompany" (
    "ticker" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'GAME',
    "registeredBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EconTicker" (
    "ticker" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EconAccount" (
    "robloxId" TEXT NOT NULL PRIMARY KEY,
    "cash" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EconLedger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "robloxId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ticker" TEXT,
    "name" TEXT,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'GAME',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EconPrice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticker" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "t" INTEGER NOT NULL,
    "c" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "EconLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "ticker" TEXT,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EconCounter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "EconCompany_seq_idx" ON "EconCompany"("seq");

-- CreateIndex
CREATE INDEX "EconCompany_ownerId_idx" ON "EconCompany"("ownerId");

-- CreateIndex
CREATE INDEX "EconCompany_state_idx" ON "EconCompany"("state");

-- CreateIndex
CREATE INDEX "EconLedger_robloxId_id_idx" ON "EconLedger"("robloxId", "id");

-- CreateIndex
CREATE INDEX "EconPrice_ticker_tier_t_idx" ON "EconPrice"("ticker", "tier", "t");
